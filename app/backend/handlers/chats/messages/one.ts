import { jsonArrayFrom, jsonObjectFrom } from "@kysely/kysely/helpers/sqlite";
import { Codec } from "@nomadshiba/codec";
import { db } from "~/backend/database/client.ts";
import { router } from "~/router.ts";
import { MessageContent } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { RouteResponse } from "~/libs/RouterResponse.ts";
import { renderToolCall, renderToolResult } from "~/backend/tools/registry.ts";

router.registerHandler("GET /v1/chats/:chatId/messages/:messageId", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const messageId = params.pathname.messageId;

    const row = await db.selectFrom("chat_message")
        .where("chat_message.id", "=", messageId)
        .where("chat_message.chat_id", "=", chatId)
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
                                    ).as("TypeFunctions")
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
        .executeTakeFirst();

    if (!row) {
        return { status: "NotFound" };
    }

    const toolCallNameById = new Map<string, string>();
    if (row.RoleAssistant?.ToolCalls) {
        for (const tc of row.RoleAssistant.ToolCalls) {
            if (tc.TypeFunctions) toolCallNameById.set(tc.id, tc.TypeFunctions.name);
        }
    }

    let content: Codec.InferOutput<typeof MessageContent>;
    if (row.role === "system" && row.RoleSystem) {
        content = {
            kind: "system",
            value: { content: row.RoleSystem.content },
        };
    } else if (row.role === "user" && row.RoleUser) {
        content = {
            kind: "user",
            value: { content: row.RoleUser.content },
        };
    } else if (row.role === "assistant" && row.RoleAssistant) {
        content = {
            kind: "assistant",
            value: {
                content: row.RoleAssistant.content ?? undefined,
                refusal: row.RoleAssistant.refusal ?? undefined,
                tool_calls: (row.RoleAssistant.ToolCalls ?? []).map((call) => {
                    if (call.type === "function" && call.TypeFunctions) {
                        return {
                            kind: "function",
                            value: {
                                id: call.id,
                                name: call.TypeFunctions.name,
                                arguments: call.TypeFunctions.arguments,
                                display: renderToolCall(call.TypeFunctions.name, call.TypeFunctions.arguments),
                            },
                        };
                    }
                    throw new RouteResponse({ status: "NotImplemented", message: `ToolCall type not implemented: ${call.type}` });
                }),
            },
        };
    } else if (row.role === "tool" && row.RoleTool) {
        const toolName = toolCallNameById.get(row.RoleTool.tool_call_id) ?? "tool";
        content = {
            kind: "tool",
            value: {
                content: row.RoleTool.content,
                tool_call_id: row.RoleTool.tool_call_id,
                display: renderToolResult(toolName, "", row.RoleTool.content),
            },
        };
    } else {
        return {
            status: "NotImplemented",
            message: `Unknown role: ${row.role}`,
        };
    }

    return {
        status: "OK",
        data: { id: row.id, chat_id: row.chat_id, content, created: row.created },
    };
});
