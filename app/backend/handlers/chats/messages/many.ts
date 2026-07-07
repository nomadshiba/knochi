import { Codec } from "@nomadshiba/codec";
import { messagesFromDatabase } from "~/backend/chats/ChatClient.ts";
import { MessageContent } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { RouteResponse } from "~/libs/routing/RouterResponse.ts";
import { router } from "~/router.ts";
import { db } from "~/backend/database/client.ts";

router.registerHandler("GET /v1/chats/:chatId/messages", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const rows = await messagesFromDatabase(chatId);
    const messages = await Promise.all(rows.map(async (message) => {
        let content: Codec.InferOutput<typeof MessageContent>;
        if (message.RoleSystem) {
            content = {
                kind: "system",
                value: { content: message.RoleSystem.content },
            };
        } else if (message.RoleUser) {
            content = {
                kind: "user",
                value: { content: message.RoleUser.content },
            };
        } else if (message.RoleAssistant) {
            content = {
                kind: "assistant",
                value: {
                    content: message.RoleAssistant.content ?? undefined,
                    refusal: message.RoleAssistant.refusal ?? undefined,
                    tool_calls: (message.RoleAssistant.ToolCalls ?? []).map((call) => {
                        if (!call.TypeFunction) {
                            throw new RouteResponse({
                                status: "NotImplemented",
                                message: `ToolCall type not implemented: ${call.type}`,
                            });
                        }
                        const providerCall = {
                            id: call.id,
                            type: "function" as const,
                            function: { name: call.TypeFunction.name, arguments: call.TypeFunction.arguments },
                        };
                        return {
                            kind: "function",
                            value: {
                                id: call.id,
                                name: call.TypeFunction.name,
                                arguments: call.TypeFunction.arguments,
                                display: {
                                    summary: renderToolCallSummary(providerCall),
                                    content: renderToolCallContent(providerCall),
                                },
                            },
                        };
                    }),
                },
            };
        } else if (message.RoleTool) {
            content = {
                kind: "tool",
                value: {
                    content: message.RoleTool.content,
                    tool_call_id: message.RoleTool.tool_call_id,
                    display: await renderToolResult({
                        role: "tool",
                        content: message.RoleTool.content,
                        tool_call_id: message.RoleTool.tool_call_id,
                    }, db),
                },
            };
        } else {
            throw new RouteResponse({ status: "NotImplemented", message: `Unknown role: ${message.role}` });
        }

        return { id: message.id, content, created: message.created };
    }));

    return {
        status: "OK",
        data: messages,
    };
});
