import { jsonArrayFrom, jsonObjectFrom } from "@kysely/kysely/helpers/sqlite";
import { Codec } from "@nomadshiba/codec";
import { db } from "~/database/client.ts";
import { router } from "~/router.ts";
import { MessageContent } from "~/handlers/chats/messages/MessageContent.ts";
import { RouteResponse } from "~/libs/RouterResponse.ts";

router.registerHandler("GET /v1/chats/:chatId/messages/:messageId", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const messageId = params.pathname.messageId;

    const row = await db.selectFrom("chat_message")
        .where("chat_message.id", "=", messageId)
        .where("chat_message.chat_id", "=", chatId)
        .selectAll("chat_message")
        .select((eb) => [
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_system")
                    .whereRef("chat_message_role_system.id", "=", "chat_message.id")
                    .selectAll("chat_message_role_system"),
            ).as("RoleSystem"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_user")
                    .whereRef("chat_message_role_user.id", "=", "chat_message.id")
                    .selectAll("chat_message_role_user"),
            ).as("RoleUser"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_assistant")
                    .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                    .selectAll("chat_message_role_assistant")
                    .select((eb) => [
                        jsonArrayFrom(
                            eb.selectFrom("chat_message_role_assistant_toolcall")
                                .whereRef("chat_message_role_assistant_toolcall.chat_message_id", "=", "chat_message_id")
                                .selectAll("chat_message_role_assistant_toolcall")
                                .select((eb) =>
                                    jsonObjectFrom(
                                        eb.selectFrom("chat_message_role_assistant_toolcall_type_function")
                                            .whereRef(
                                                "chat_message_role_assistant_toolcall_type_function.id",
                                                "=",
                                                "chat_message_role_assistant_toolcall.id",
                                            )
                                            .selectAll("chat_message_role_assistant_toolcall_type_function"),
                                    ).as("TypeFunction")
                                ),
                        ).as("ToolCalls"),
                    ]),
            ).as("RoleAssistant"),
            jsonObjectFrom(
                eb.selectFrom("chat_message_role_tool")
                    .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                    .selectAll("chat_message_role_tool"),
            ).as("RoleTool"),
        ])
        .executeTakeFirst();

    if (!row) {
        return { status: "NotFound" };
    }

    let content: Codec.InferOutput<typeof MessageContent>;
    if (row.role === "system" && row.RoleSystem) {
        content = {
            kind: "system",
            value: {
                content: row.RoleSystem.content,
            },
        };
    } else if (row.role === "user" && row.RoleUser) {
        content = {
            kind: "user",
            value: {
                content: row.RoleUser.content,
            },
        };
    } else if (row.role === "assistant" && row.RoleAssistant) {
        content = {
            kind: "assistant",
            value: {
                content: row.RoleAssistant.content ?? undefined,
                refusal: row.RoleAssistant.refusal ?? undefined,
                tool_calls: row.RoleAssistant.ToolCalls.map((call) => {
                    if (call.type === "function" && call.TypeFunction) {
                        return {
                            kind: "function",
                            value: {
                                name: call.TypeFunction.name,
                                arguments: call.TypeFunction.arguments,
                            },
                        };
                    }

                    throw new RouteResponse({ status: "NotImplemented", message: `ToolCall type not implemented: ${call.type}` });
                }),
            },
        };
    } else if (row.role === "tool" && row.RoleTool) {
        content = {
            kind: "tool",
            value: { content: row.RoleTool.content, tool_call_id: row.RoleTool.tool_call_id },
        };
    } else {
        return {
            status: "NotImplemented",
            message: `Unknown role: ${row.role}`,
        };
    }

    return {
        status: "OK",
        data: {
            id: row.id,
            chat_id: row.chat_id,
            content,
            created: row.created,
        },
    };
});
