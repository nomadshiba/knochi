import { v7 } from "@std/uuid";
import { Codec } from "@nomadshiba/codec";
import { Agent } from "~/backend/agents/Agent.ts";
import { agents, agentsByName } from "~/backend/agents/mod.ts";
import { runAgent } from "~/backend/chats/run.ts";
import { db } from "~/backend/database/client.ts";
import {
    ProviderAssistantMessageStream,
    ProviderChatMessage,
    ProviderClient,
    ProviderToolCall,
} from "~/backend/providers/ProviderClient.ts";
import { WeakRefMap } from "~/libs/collections/WeakRefMap.ts";
import { Emitter } from "~/libs/events/Emitter.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { renderToolCall, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";

export type ChatEvent =
    | { type: "message"; data: Codec.InferInput<typeof ChatMessageOutput> }
    | { type: "stream"; data: ProviderAssistantMessageStream };

export class ChatClient {
    private constructor(
        public readonly id: string,
        public readonly emitter: Emitter<ChatEvent>,
        public readonly agent: Agent,
        public readonly model: { name: string; provider: ProviderClient } | undefined,
        private readonly prefixMessages: ProviderChatMessage[],
        private readonly oldMessages: ProviderChatMessage[],
        private readonly newMessages: ProviderChatMessage[],
        private readonly suffixMessages: ProviderChatMessage[],
    ) {}

    public static async create(name: string): Promise<ChatClient> {
        const now = Date.now();
        const id = v7.generate(now);

        const lastChat = await db.selectFrom("chat").orderBy("chat.updated", "desc")
            .limit(1)
            .select(["agent", "model", "provider_id"])
            .executeTakeFirst();

        await db.insertInto("chat").values({
            id,
            name,
            agent: lastChat?.agent ?? agents[0].name,
            model: lastChat?.model,
            provider_id: lastChat?.provider_id,
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
        const oldMessages = await loadFromDB(chatId);
        const newMessages: ProviderChatMessage[] = [];
        const suffixMessages: ProviderChatMessage[] = [];

        const providerInfo = await db.selectFrom("provider").orderBy("created", "desc")
            .selectAll()
            .$if(Boolean(chat?.provider_id), (qb) => qb.where("id", "=", chat!.provider_id))
            .executeTakeFirst();
        const provider = providerInfo ? ProviderClient.create({ base: providerInfo.base, key: providerInfo.key }) : undefined;

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
    }

    public async changeAgent(agent: Agent) {
        await db.updateTable("chat").where("chat.id", "=", this.id).set({ agent: agent.name }).execute();
        this.prefixMessages[0] = { role: "system", content: agent.prompt };
    }

    public *messages(transformer: (message: ProviderChatMessage) => ProviderChatMessage = (noop) => noop): Generator<ProviderChatMessage> {
        for (const message of this.prefixMessages) yield message;
        for (const message of this.oldMessages) yield transformer(message);
        for (const message of this.newMessages) yield transformer(message);
        for (const message of this.suffixMessages) yield message;
    }

    public async pushMessage(message: ProviderChatMessage) {
        const { role } = message;
        const now = Date.now();
        const id = v7.generate(now);

        const tx = await db.startTransaction().execute();

        await tx.insertInto("chat_message")
            .values({ id, chat_id: this.id, role: message.role, created: now })
            .execute();

        let content: (ChatEvent & { type: "message" })["data"]["content"];
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
                value: { content: message.content, tool_call_id: message.tool_call_id, display: await renderToolResult(message) },
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
        this.emitter.emit({
            type: "message",
            data: { id, content, created: now },
        });

        await tx.commit().execute();

        if (message.role === "user") {
            runAgent(this).catch((reason) => {
                console.error("agent run failed:", reason);
                this.emitter.emit({
                    type: "stream",
                    data: { kind: "done", value: { finish_reason: `Error: ${String(reason)}` } },
                });
            });
        }
    }
}

async function loadFromDB(chatId: string): Promise<ProviderChatMessage[]> {
    const rows = await db.selectFrom("chat_message")
        .where("chat_message.chat_id", "=", chatId)
        .orderBy("chat_message.created", "asc")
        .select([
            "chat_message.id",
            "chat_message.role",
            "chat_message.created",
        ])
        .select((eb) => [
            eb.selectFrom("chat_message_role_system")
                .whereRef("chat_message_role_system.id", "=", "chat_message.id")
                .select("chat_message_role_system.content")
                .as("system_content"),
            eb.selectFrom("chat_message_role_user")
                .whereRef("chat_message_role_user.id", "=", "chat_message.id")
                .select("chat_message_role_user.content")
                .as("user_content"),
            eb.selectFrom("chat_message_role_assistant")
                .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                .select("chat_message_role_assistant.content")
                .as("assistant_content"),
            eb.selectFrom("chat_message_role_assistant")
                .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                .select("chat_message_role_assistant.refusal")
                .as("assistant_refusal"),
            eb.selectFrom("chat_message_role_tool")
                .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                .select("chat_message_role_tool.content")
                .as("tool_content"),
            eb.selectFrom("chat_message_role_tool")
                .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                .select("chat_message_role_tool.tool_call_id")
                .as("tool_tool_call_id"),
        ])
        .execute();

    const out: ProviderChatMessage[] = [];
    for (const row of rows) {
        if (row.role === "system") {
            out.push({ role: "system", content: row.system_content! });
        } else if (row.role === "user") {
            out.push({ role: "user", content: row.user_content! });
        } else if (row.role === "assistant") {
            const toolCallRows = await db.selectFrom("chat_message_role_assistant_toolcall")
                .where("chat_message_role_assistant_toolcall.chat_message_id", "=", row.id)
                .select([
                    "chat_message_role_assistant_toolcall.id",
                    "chat_message_role_assistant_toolcall.type",
                ])
                .execute();
            const tool_calls: ProviderToolCall[] = [];
            for (const tc of toolCallRows) {
                if (tc.type !== "function") continue;
                const fn = await db.selectFrom("chat_message_role_assistant_toolcall_type_function")
                    .where("chat_message_role_assistant_toolcall_type_function.id", "=", tc.id)
                    .select([
                        "chat_message_role_assistant_toolcall_type_function.name",
                        "chat_message_role_assistant_toolcall_type_function.arguments",
                    ])
                    .executeTakeFirst();
                if (!fn) continue;
                tool_calls.push({
                    id: tc.id,
                    type: "function",
                    function: { name: fn.name, arguments: fn.arguments },
                });
            }
            out.push({
                role: "assistant",
                content: row.assistant_content ?? null,
                refusal: row.assistant_refusal ?? undefined,
                tool_calls: tool_calls.length ? tool_calls : undefined,
            });
        } else if (row.role === "tool") {
            out.push({
                role: "tool",
                content: row.tool_content!,
                tool_call_id: row.tool_tool_call_id!,
            });
        }
    }
    return out;
}
