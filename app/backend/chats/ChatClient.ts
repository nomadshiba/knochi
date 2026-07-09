import { SelectQueryBuilder } from "@kysely/kysely";
import { jsonArrayFrom, jsonObjectFrom } from "@kysely/kysely/helpers/sqlite";
import { Codec } from "@nomadshiba/codec";
import { v7 } from "@std/uuid";
import { Agent } from "~/backend/agents/Agent.ts";
import { agents, agentsByName } from "~/backend/agents/mod.ts";
import { ChatMessageBuffer } from "~/backend/chats/ChatMessageBuffer.ts";
import { runAgent } from "~/backend/chats/run.ts";
import { db } from "~/backend/database/client.ts";
import { DB } from "~/backend/database/generated/types.ts";
import { ChatAssistantMessageStream } from "~/backend/handlers/chats/messages/ChatAssistantMessageStream.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { ProviderClient, ProviderToolCall } from "~/backend/providers/ProviderClient.ts";
import { WeakRefMap } from "~/libs/collections/WeakRefMap.ts";
import { Emitter } from "~/libs/events/Emitter.ts";

type ChatEvent = Codec.InferInput<typeof ChatStreamOutput>;

export class ChatClient {
    private constructor(
        public readonly id: string,
        public readonly emitter: Emitter<ChatEvent>,
        public agent: Agent,
        public model: { name: string; provider: ProviderClient } | undefined,
        public readonly messages: ChatMessageBuffer,
    ) {
    }

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

        // TODO: maybe this should be handled on the frontend? like frontend has to tell us during chat creation
        // Backend should decide what is the default.
        const agent = options?.agent?.name ?? lastChat?.agent ?? agents[0].name;
        const provider_id = options?.providerId ?? lastChat?.provider_id;
        const model = options?.model ?? lastChat?.model;

        await db.insertInto("chat").values({
            id,
            name,
            root_tool_call_id: options?.callId,
            agent,
            model,
            provider_id,
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
        const messageBuffer = ChatMessageBuffer.create();
        messageBuffer.setPrefix([{ role: "system", content: agent.prompt }]);

        const rows = await messagesFromDatabase(chatId);
        for (const row of rows) {
            if (row.RoleSystem) {
                messageBuffer.add({
                    id: row.id,
                    content: { kind: "system", value: { content: row.RoleSystem.content } },
                    created: new Date(row.created),
                });
            } else if (row.RoleUser) {
                messageBuffer.add({
                    id: row.id,
                    content: { kind: "user", value: { content: row.RoleUser.content } },
                    created: new Date(row.created),
                });
            } else if (row.RoleAssistant) {
                messageBuffer.add({
                    id: row.id,
                    content: {
                        kind: "assistant",
                        value: {
                            content: row.RoleAssistant.content,
                            refusal: row.RoleAssistant.refusal,
                            tool_calls: row.RoleAssistant.ToolCalls.map((call) => {
                                const providerCall: ProviderToolCall = {
                                    id: call.call_id,
                                    type: "function",
                                    function: {
                                        name: call.name,
                                        arguments: call.arguments,
                                    },
                                };

                                return {
                                    kind: "function",
                                    value: {
                                        id: call.call_id,
                                        name: call.name,
                                        arguments: call.arguments,
                                        display: {
                                            summary: renderToolCallSummary(providerCall),
                                            content: renderToolCallContent(providerCall),
                                        },
                                        result: call.result
                                            ? { content: call.result, display: renderToolResult(call.name, call.result) }
                                            : null,
                                    },
                                };
                            }),
                        },
                    },
                    created: new Date(row.created),
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
            messageBuffer,
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
        this.messages.setPrefix([{ role: "system", content: agent.prompt }]);
    }

    public async pushStream(stream: ChatAssistantMessageStream) {
        const { id, delta } = stream;
        const { kind } = delta;
        const tx = await db.startTransaction().execute();
        try {
            const message = await tx.selectFrom("chat_message").where("id", "=", id).select("role").executeTakeFirst();
            if (!message) {
                throw new Error(`Can't add delta to unknown message id: ${id}`);
            }
            if (message.role !== "assistant") {
                throw new Error(`Can't add delta to message id: ${id}, because it has the role: ${message.role}`);
            }

            switch (kind) {
                case "text": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({
                        content: (eb) => eb(eb.ref("chat_message_role_assistant.content"), "||", delta.value),
                    }).execute();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "refusal": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({
                        refusal: (eb) => eb(eb.ref("chat_message_role_assistant.refusal"), "||", delta.value),
                    }).execute();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "tool_call_new": {
                    await tx.insertInto("tool_call")
                        .values({
                            chat_message_id: id,
                            index: delta.value.index,
                            call_id: delta.value.id,
                            name: "",
                            arguments: "",
                        }).executeTakeFirstOrThrow();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "tool_call_delta": {
                    await tx.updateTable("tool_call")
                        .where("chat_message_id", "=", stream.id)
                        .where("index", "=", delta.value.index)
                        .set((eb) => ({
                            name: eb(eb.ref("name"), "||", delta.value.name),
                            arguments: eb(eb.ref("arguments"), "||", delta.value.arguments),
                        })).executeTakeFirstOrThrow();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "tool_call_done": {
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "tool_call_result": {
                    await tx.updateTable("tool_call")
                        .where("chat_message_id", "=", id)
                        .where("index", "=", delta.value.index)
                        .set({ result: delta.value.result.content })
                        .executeTakeFirstOrThrow();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                case "done": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({ partial: 0 }).execute();
                    this.emitter.emit({ kind: "stream", value: stream });
                    break;
                }
                default:
                    throw new Error(`Unhandled stream kind: ${kind satisfies never}`);
            }

            await tx.commit().execute();
        } catch (reason) {
            await tx.rollback().execute();
            throw reason;
        }
    }

    public async pushMessage(message: ChatMessageOutput, options?: { wait?: boolean; partial?: boolean }) {
        const { id, content } = message;
        const { kind } = content;
        const tx = await db.startTransaction().execute();

        try {
            await tx.insertInto("chat_message").values({ id, chat_id: this.id, role: kind, created: message.created.getTime() }).execute();

            if (kind === "system") {
                await tx.insertInto("chat_message_role_system").values({ id, content: content.value.content }).execute();
                if (!options?.partial) this.messages.add(message);
                this.emitter.emit({ kind: "message", value: message });
            } else if (kind === "user") {
                await tx.insertInto("chat_message_role_user").values({ id, content: content.value.content }).execute();
                if (!options?.partial) this.messages.add(message);
                this.emitter.emit({ kind: "message", value: message });
            } else if (kind === "assistant") {
                await tx.insertInto("chat_message_role_assistant")
                    .values({ id, content: content.value.content, refusal: content.value.refusal, partial: 0 })
                    .execute();
                if (content.value.tool_calls.length) {
                    await tx.insertInto("tool_call").values(content.value.tool_calls.map((call, index) => ({
                        index,
                        chat_message_id: message.id,
                        call_id: call.value.id,
                        name: call.value.name,
                        arguments: call.value.arguments,
                        result: call.value.result?.content,
                    }))).execute();
                }
                if (!options?.partial) this.messages.add(message);
                this.emitter.emit({ kind: "message", value: message });
            } else {
                throw new Error(`Unknown message role: ${kind satisfies never}`);
            }

            await tx.commit().execute();
        } catch (reason) {
            await tx.rollback().execute();
            throw reason;
        }

        if (kind === "user") {
            const promise = runAgent(this);
            if (options?.wait) await promise;
        }
    }
}

export async function messagesFromDatabase(
    chatId: string,
    filter?: (query: SelectQueryBuilder<DB, "chat_message", {}>) => SelectQueryBuilder<DB, "chat_message", {}>,
) {
    const query = db.selectFrom("chat_message")
        .where("chat_message.chat_id", "=", chatId)
        .orderBy("chat_message.created", "asc");

    filter?.(query);

    const rows = await query
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
                            eb.selectFrom("tool_call")
                                .whereRef("tool_call.chat_message_id", "=", "chat_message.id")
                                .orderBy("tool_call.index", "asc")
                                .select([
                                    "tool_call.call_id",
                                    "tool_call.name",
                                    "tool_call.arguments",
                                    "tool_call.result",
                                ]),
                        ).as("ToolCalls"),
                    ]),
            ).as("RoleAssistant"),
        ])
        .execute();

    return rows;
}
