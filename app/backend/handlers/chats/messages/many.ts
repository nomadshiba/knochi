import { ChatClient, messagesFromDatabase } from "~/backend/chats/ChatClient.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { ProviderToolCall } from "~/backend/providers/ProviderClient.ts";
import { router } from "~/router.ts";

router.registerHandler("GET /v1/chats/:chatId/messages", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const chat = await ChatClient.getOrLoad(chatId);

    // TODO: This is a temporty solution because we dont push to the MessageBuffer before the Message is done.

    const memory = chat.messages.iter().toArray();
    const lastMessage = memory.at(-1);
    if (lastMessage) {
        const storage = await messagesFromDatabase(chatId, (query) => query.where("chat_message.id", ">", lastMessage.id));
        for (const row of storage) {
            if (row.RoleSystem) {
                memory.push({
                    id: row.id,
                    content: { kind: "system", value: { content: row.RoleSystem.content } },
                    created: new Date(row.created),
                });
            } else if (row.RoleUser) {
                memory.push({
                    id: row.id,
                    content: { kind: "user", value: { content: row.RoleUser.content } },
                    created: new Date(row.created),
                });
            } else if (row.RoleAssistant) {
                memory.push({
                    id: row.id,
                    content: {
                        kind: "assistant",
                        value: {
                            partial: Boolean(row.RoleAssistant.partial),
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
    }

    return {
        status: "OK",
        data: memory,
    };
});
