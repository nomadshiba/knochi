import { Codec } from "@nomadshiba/codec";
import { v7 } from "@std/uuid";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { Agent } from "~/backend/agents/Agent.ts";
import { agents, agentsByName } from "~/backend/agents/mod.ts";
import { runAgent } from "~/backend/chats/run.ts";
import { db } from "~/backend/database/client.ts";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { renderToolCall, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { ProviderChatMessage, ProviderClient, ProviderToolCall } from "~/backend/providers/ProviderClient.ts";
import { WeakRefMap } from "~/libs/collections/WeakRefMap.ts";
import { Emitter } from "~/libs/events/Emitter.ts";

type ChatEvent = Codec.InferInput<typeof ChatStreamOutput>;

export class ChatClient {
    private constructor(
        public readonly id: string,
        public readonly emitter: Emitter<ChatEvent>,
        public agent: Agent,
        public model: { name: string; provider: ProviderClient } | undefined,
        private readonly prefixMessages: ProviderChatMessage[],
        private readonly oldMessages: ProviderChatMessage[],
        private readonly newMessages: ProviderChatMessage[],
        private readonly suffixMessages: ProviderChatMessage[],
    ) {}

    /**
     * @param options.agent Agent to use for the new chat. Defaults to the most recently used chat's agent.
     * @param options.providerId Provider to use for the new chat. Defaults to the most recently used chat's provider.
     * @param options.model Model to use for the new chat. Defaults to the most recently used chat's model.
     * @param options.callId If this chat is a subagent run spawned by a tool call (e.g. `task`), the id
     * (`chat_message_role_assistant_toolcall.id`) of that tool call — links this chat back to it via `root_tool_call_id`.
     */
    public static async create(
        name: string,
        options?: { agent?: Agent; providerId?: string; model?: string; callId?: string },
    ): Promise<ChatClient> {
        const now = Date.now();
        const id = v7.generate(now);

        const lastChat = await db.selectFrom("chat").orderBy("chat.updated", "desc")
            .limit(1)
            .select(["agent", "model", "provider_id"])
            .executeTakeFirst();

        await db.insertInto("chat").values({
            id,
            name,
            root_tool_call_id: options?.callId,
            agent: options?.agent?.name ?? lastChat?.agent ?? agents[0].name,
            model: options?.model ?? lastChat?.model,
            provider_id: options?.providerId ?? lastChat?.provider_id,
            created: now,
            updated: now,
        }).execute();

        return ChatClient.getOrLoad(id);
    }

    private static chatCache = new WeakRefMap<string, ChatClient>();
    private static loading = new Map<string, Promise<ChatClient>>();
    public static getOrLoad(chatId: string): Promise<ChatClient> {
        const cached = this.chatCache.get(chatId);
        if (cached) return Promise.resolve(cached);

        const inflight = this.loading.get(chatId);
        if (inflight) return inflight;

        const promise = this.load(chatId)
            .then((chat) => {
                this.chatCache.set(chatId, chat);
                return chat;
            })
            .finally(() => this.loading.delete(chatId));
        this.loading.set(chatId, promise);
        return promise;
    }
    private static async load(chatId: string): Promise<ChatClient> {
        const chat = await db.selectFrom("chat").where("id", "=", chatId).selectAll().executeTakeFirst();
        const agent = (chat?.agent ? agentsByName.get(chat?.agent) : undefined) ?? agents[0];
        const prefixMessages: ProviderChatMessage[] = agent ? [{ role: "system", content: agent.prompt }] : [];
        const oldMessages: ProviderChatMessage[] = [];
        const newMessages: ProviderChatMessage[] = [];
        const suffixMessages: ProviderChatMessage[] = [];

        const rows = await messagesFromDatabase(chatId);
        for (const row of rows) {
            if (row.RoleSystem) {
                oldMessages.push({ role: "system", content: row.RoleSystem.content });
            } else if (row.RoleUser) {
                oldMessages.push({ role: "user", content: row.RoleUser.content });
            } else if (row.RoleAssistant) {
                const tool_calls: ProviderToolCall[] = [];
                for (const call of row.RoleAssistant.ToolCalls) {
                    if (!call.TypeFunction) continue;
                    tool_calls.push({
                        id: call.id,
                        type: "function",
                        function: { name: call.TypeFunction.name, arguments: call.TypeFunction.arguments },
                    });
                }
                oldMessages.push({
                    role: "assistant",
                    content: row.RoleAssistant.content,
                    refusal: row.RoleAssistant.refusal,
                    tool_calls: tool_calls,
                });
            } else if (row.RoleTool) {
                oldMessages.push({
                    role: "tool",
                    content: row.RoleTool.content,
                    tool_call_id: row.RoleTool.tool_call_id,
                });
            }
        }

        const providerRow = await db.selectFrom("provider").orderBy("created", "desc")
            .select("id")
            .$if(Boolean(chat?.provider_id), (qb) => qb.where("id", "=", chat!.provider_id))
            .executeTakeFirst();
        const provider = providerRow ? await ProviderClient.open(providerRow.id) : undefined;

        return new ChatClient(
            chatId,
            new Emitter(),
            agent,
            provider ? { name: chat!.model!, provider } : undefined,
            prefixMessages,
            oldMessages,
            newMessages,
            suffixMessages,
        );
    }

    public async changeModel(providerId: string, model: string) {
        await db.updateTable("chat").where("chat.id", "=", this.id).set({ provider_id: providerId, model }).execute();

        const provider = await ProviderClient.open(providerId);
        this.model = provider ? { name: model, provider } : undefined;
    }

    public async changeAgent(agent: Agent) {
        await db.updateTable("chat").where("chat.id", "=", this.id).set({ agent: agent.name }).execute();
        this.agent = agent;
        this.prefixMessages[0] = { role: "system", content: agent.prompt };
    }

    public *messages(transformer: (message: ProviderChatMessage) => ProviderChatMessage = (noop) => noop): Generator<ProviderChatMessage> {
        for (const message of this.prefixMessages) yield message;
        for (const message of this.oldMessages) yield transformer(message);
        for (const message of this.newMessages) yield transformer(message);
        for (const message of this.suffixMessages) yield message;
    }

    public async pushMessage(message: ProviderChatMessage, options?: { wait?: boolean }) {
        const { role } = message;
        const now = Date.now();
        const id = v7.generate(now);

        const tx = await db.startTransaction().execute();

        await tx.insertInto("chat_message")
            .values({ id, chat_id: this.id, role: message.role, created: now })
            .execute();

        let content: (ChatEvent & { kind: "message" })["value"]["content"];
        if (role === "assistant") {
            await tx.insertInto("chat_message_role_assistant")
                .values({ id, content: message.content ?? null, refusal: message.refusal ?? null })
                .execute();
            for (const call of message.tool_calls ?? []) {
                await tx.insertInto("chat_message_role_assistant_toolcall")
                    .values({ id: call.id, chat_message_id: id, type: call.type })
                    .execute();
                if (call.type === "function") {
                    await tx.insertInto("chat_message_role_assistant_toolcall_type_function")
                        .values({ id: call.id, name: call.function.name, arguments: call.function.arguments })
                        .execute();
                }
            }
            content = {
                kind: "assistant",
                value: {
                    content: message.content ?? undefined,
                    refusal: message.refusal ?? undefined,
                    tool_calls: message.tool_calls?.map((call) => ({
                        kind: "function",
                        value: {
                            id: call.id,
                            name: call.function.name,
                            arguments: call.function.arguments,
                            display: renderToolCall(call),
                        },
                    })) ?? [],
                },
            };
        } else if (role === "tool") {
            await tx.insertInto("chat_message_role_tool")
                .values({ id, content: message.content, tool_call_id: message.tool_call_id })
                .execute();
            content = {
                kind: "tool",
                value: { content: message.content, tool_call_id: message.tool_call_id, display: await renderToolResult(message, tx) },
            };
        } else if (role === "system") {
            await tx.insertInto("chat_message_role_system").values({ id, content: message.content }).execute();
            content = { kind: "system", value: { content: message.content } };
        } else if (role === "user") {
            await tx.insertInto("chat_message_role_user").values({ id, content: message.content }).execute();
            content = { kind: "user", value: { content: message.content } };
        } else {
            throw new Error(`Unknown message role: ${role satisfies never}`);
        }

        this.newMessages.push(message);
        this.emitter.emit({ kind: "message", value: { id, content, created: now } });

        await tx.commit().execute();

        if (message.role === "user") {
            const promise = runAgent(this).catch((reason) => {
                console.error("agent run failed:", reason);
                this.emitter.emit({
                    kind: "stream",
                    value: { kind: "done", value: { finish_reason: `Error: ${String(reason)}` } },
                });
            });
            if (options?.wait) await promise;
        }
    }
}

export async function messagesFromDatabase(chatId: string) {
    const rows = await db.selectFrom("chat_message")
        .where("chat_message.chat_id", "=", chatId)
        .orderBy("chat_message.created", "asc")
        .select([
            "chat_message.id",
            "chat_message.chat_id",
            "chat_message.role",
            "chat_message.created",
        ])
        .select((eb) => [
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_system")
                    .whereRef("chat_message_role_system.id", "=", "chat_message.id")
                    .select("chat_message_role_system.content"),
            ).as("RoleSystem"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_user")
                    .whereRef("chat_message_role_user.id", "=", "chat_message.id")
                    .select("chat_message_role_user.content"),
            ).as("RoleUser"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_assistant")
                    .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                    .select([
                        "chat_message_role_assistant.content",
                        "chat_message_role_assistant.refusal",
                    ])
                    .select((eb) => [
                        jsonArrayFrom(
                            eb.selectFrom("chat_message_role_assistant_toolcall")
                                .whereRef("chat_message_role_assistant_toolcall.chat_message_id", "=", "chat_message.id")
                                .select([
                                    "chat_message_role_assistant_toolcall.id",
                                    "chat_message_role_assistant_toolcall.type",
                                ])
                                .select((eb) =>
                                    jsonObjectFrom(
                                        eb.selectFrom("chat_message_role_assistant_toolcall_type_function")
                                            .whereRef(
                                                "chat_message_role_assistant_toolcall_type_function.id",
                                                "=",
                                                "chat_message_role_assistant_toolcall.id",
                                            )
                                            .select([
                                                "chat_message_role_assistant_toolcall_type_function.name",
                                                "chat_message_role_assistant_toolcall_type_function.arguments",
                                            ]),
                                    ).as("TypeFunction")
                                ),
                        ).as("ToolCalls"),
                    ]),
            ).as("RoleAssistant"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_tool")
                    .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                    .select([
                        "chat_message_role_tool.content",
                        "chat_message_role_tool.tool_call_id",
                    ]),
            ).as("RoleTool"),
        ])
        .execute();

    return rows;
}
