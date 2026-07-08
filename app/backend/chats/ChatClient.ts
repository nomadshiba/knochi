import { Codec } from "@nomadshiba/codec";
import { v7 } from "@std/uuid";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";
import { Agent } from "~/backend/agents/Agent.ts";
import { agents, agentsByName } from "~/backend/agents/mod.ts";
import { ChatMessageBuffer } from "~/backend/chats/ChatMessageBuffer.ts";
import { runAgent } from "~/backend/chats/run.ts";
import { db } from "~/backend/database/client.ts";
import { ChatAssistantMessageDelta } from "~/backend/handlers/chats/messages/ChatAssistantMessageDelta.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import {
    ProviderAssistantMessageDelta,
    ProviderChatMessage,
    ProviderClient,
    ProviderToolCall,
} from "~/backend/providers/ProviderClient.ts";
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
    ) {}

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
        const messageBuffer = ChatMessageBuffer.create();

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

    public async pushProviderMessageDelta(id: string, providerDelta: ProviderAssistantMessageDelta) {
        const tx = await db.startTransaction().execute();
        try {
            const message = await tx.selectFrom("chat_message").where("id", "=", id).selectAll().executeTakeFirst();
            if (!message) {
                throw new Error(`Can't add delta to unknown message id: ${id}`);
            }
            if (message.role !== "assistant") {
                throw new Error(`Can't add delta to message id: ${id}, because it has the role: ${message.role}`);
            }

            switch (providerDelta.kind) {
                case "done": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({ partial: 0 }).execute();
                    const result = await tx.selectFrom("chat_message_role_assistant").where("id", "=", id)
                        .selectAll("chat_message_role_assistant")
                        .select((eb) =>
                            eb.selectFrom("chat_message")
                                .whereRef("chat_message.id", "=", "chat_message_role_assistant.id")
                                .select("created")
                                .as("created")
                        )
                        .select((eb) => [
                            jsonArrayFrom(
                                eb.selectFrom("tool_call")
                                    .whereRef("tool_call.chat_message_id", "=", "chat_message_role_assistant.id")
                                    .orderBy("tool_call.index", "asc")
                                    .select([
                                        "tool_call.call_id",
                                        "tool_call.name",
                                        "tool_call.arguments",
                                        "tool_call.result",
                                    ]),
                            ).as("ToolCalls"),
                        ]).executeTakeFirstOrThrow();
                    this.messages.add({
                        id: result.id,
                        content: {
                            kind: "assistant",
                            value: {
                                content: result.content,
                                refusal: result.refusal,
                                tool_calls: result.ToolCalls.map((call) => {
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
                        created: new Date(result.created!),
                    });
                    const delta: ChatAssistantMessageDelta = {
                        id,
                        delta: { kind: "done", value: { kind: "provider", value: providerDelta.value.finish_reason } },
                    };
                    this.emitter.emit({ kind: "delta", value: delta });
                    break;
                }
                case "text": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({
                        content: (eb) => eb(eb.ref("chat_message_role_assistant.content"), "||", providerDelta.value),
                    }).execute();
                    const delta: ChatAssistantMessageDelta = { id, delta: { kind: "text", value: providerDelta.value } };
                    this.emitter.emit({ kind: "delta", value: delta });
                    break;
                }
                case "refusal": {
                    await tx.updateTable("chat_message_role_assistant").where("id", "=", id).set({
                        refusal: (eb) => eb(eb.ref("chat_message_role_assistant.refusal"), "||", providerDelta.value),
                    }).execute();
                    const delta: ChatAssistantMessageDelta = { id, delta: { kind: "refusal", value: providerDelta.value } };
                    this.emitter.emit({ kind: "delta", value: delta });
                    break;
                }
                case "tool_call": {
                    const partial = await tx.insertInto("tool_call")
                        .values({
                            chat_message_id: id,
                            index: providerDelta.value.index,
                            call_id: v7.generate(),
                            name: providerDelta.value.name ?? "",
                            arguments: providerDelta.value.arguments ?? "",
                        })
                        .onConflict((oc) =>
                            oc.columns(["chat_message_id", "index"]).doUpdateSet({
                                name: (eb) => eb(eb.ref("name"), "||", eb.ref("excluded.name")),
                                arguments: (eb) => eb(eb.ref("arguments"), "||", eb.ref("excluded.arguments")),
                            })
                        )
                        .returning([
                            "call_id as call_id",
                            "name as name",
                            "arguments as arguments",
                        ])
                        .executeTakeFirstOrThrow();

                    const call: ProviderToolCall = {
                        id: partial.call_id,
                        type: "function",
                        function: { name: partial.name, arguments: partial.arguments },
                    };

                    const delta: ChatAssistantMessageDelta = {
                        id,
                        delta: {
                            kind: "tool_call",
                            value: {
                                index: providerDelta.value.index,
                                id: partial.call_id,
                                name: providerDelta.value.name,
                                arguments: providerDelta.value.arguments,
                                display: { summary: renderToolCallSummary(call) },
                            },
                        },
                    };
                    this.emitter.emit({ kind: "delta", value: delta });
                    break;
                }
            }

            await tx.commit().execute();
        } catch (reason) {
            await tx.rollback().execute();
            throw reason;
        }
    }

    public async pushProviderMessage(id: string, providerMessage: ProviderChatMessage, options?: { wait?: boolean }) {
        const { role } = providerMessage;
        const now = v7.extractTimestamp(id);

        const tx = await db.startTransaction().execute();

        try {
            await tx.insertInto("chat_message")
                .values({ id, chat_id: this.id, role: providerMessage.role, created: now })
                .execute();

            if (role === "system") {
                await tx.insertInto("chat_message_role_system").values({ id, content: providerMessage.content }).execute();
                const message: ChatMessageOutput<"system"> = {
                    id,
                    content: { kind: "system", value: { content: providerMessage.content } },
                    created: new Date(now),
                };
                this.messages.add(message);
                this.emitter.emit({ kind: "message", value: message });
            } else if (role === "user") {
                await tx.insertInto("chat_message_role_user").values({ id, content: providerMessage.content }).execute();
                const message: ChatMessageOutput<"user"> = {
                    id,
                    content: { kind: "user", value: { content: providerMessage.content } },
                    created: new Date(now),
                };
                this.messages.add(message);
                this.emitter.emit({ kind: "message", value: message });
            } else if (role === "assistant") {
                await tx.insertInto("chat_message_role_assistant")
                    .values({ id, content: providerMessage.content ?? "", refusal: providerMessage.refusal ?? "", partial: 0 })
                    .execute();

                const message: ChatMessageOutput<"assistant"> = {
                    id,
                    content: { kind: "assistant", value: { content: "", refusal: "", tool_calls: [] } },
                    created: new Date(now),
                };
                this.emitter.emit({ kind: "message", value: message });
            } else if (role === "tool") {
                console.log(providerMessage);
                const { chat_message_id, index, name } = await tx.updateTable("tool_call")
                    .where("call_id", "=", providerMessage.tool_call_id)
                    .set({ result: providerMessage.content })
                    .returning([
                        "chat_message_id as chat_message_id",
                        "index as index",
                        "name as name",
                    ])
                    .executeTakeFirstOrThrow();

                const delta: ChatAssistantMessageDelta = {
                    id: chat_message_id,
                    delta: {
                        kind: "tool_call",
                        value: {
                            index,
                            result: {
                                content: providerMessage.content,
                                display: renderToolResult(name, providerMessage.content),
                            },
                        },
                    },
                };
                this.emitter.emit({ kind: "delta", value: delta });
            } else {
                throw new Error(`Unknown message role: ${role satisfies never}`);
            }

            await tx.commit().execute();
        } catch (reason) {
            await tx.rollback().execute();
            throw reason;
        }

        if (providerMessage.role === "user") {
            const promise = runAgent(this);
            if (options?.wait) await promise;
        }
    }
}

async function messagesFromDatabase(chatId: string) {
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
