import { jsonObjectFrom } from "@kysely/kysely/helpers/sqlite";
import { Codec } from "@nomadshiba/codec";
import { db } from "~/database/client.ts";
import { router } from "~/router.ts";
import { ChatMessageOutput } from "~/handlers/chats/messages/ChatMessageOutput.ts";

type MessageRole = Codec.InferInput<typeof ChatMessageOutput>["role"];

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
                    .selectAll("chat_message_role_assistant"),
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

    let role: MessageRole;
    if (row.role === "system" && row.RoleSystem) {
        role = { kind: "system", value: { content: row.RoleSystem.content } } satisfies MessageRole;
    } else if (row.role === "user" && row.RoleUser) {
        role = { kind: "user", value: { content: row.RoleUser.content } } satisfies MessageRole;
    } else if (row.role === "assistant" && row.RoleAssistant) {
        role = {
            kind: "assistant",
            value: { content: row.RoleAssistant.content ?? undefined, refusal: row.RoleAssistant.refusal ?? undefined },
        } satisfies MessageRole;
    } else if (row.role === "tool" && row.RoleTool) {
        role = { kind: "tool", value: { content: row.RoleTool.content, tool_call_id: row.RoleTool.tool_call_id } } satisfies MessageRole;
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
            role,
            created: row.created,
        },
    };
});
