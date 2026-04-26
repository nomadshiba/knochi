import { db } from "~/database/client.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";

router.registerHandler("POST /v1/chats/:chatId/messages", async ({ params, data }) => {
    const chatId = params.pathname.chatId;
    const id = crypto.randomUUID();
    const now = Date.now();

    return await db.transaction().execute(async (tx): Promise<RouteHandlerResult<RoutesSchema, "POST /v1/chats/:chatId/messages">> => {
        await tx.insertInto("chat_message")
            .values({
                id,
                chat_id: chatId,
                role: data.role.kind,
                created: now,
            })
            .execute();

        if (data.role.kind === "system") {
            await tx.insertInto("chat_message_role_system")
                .values({ id, content: data.role.value.content })
                .execute();
        } else if (data.role.kind === "user") {
            await tx.insertInto("chat_message_role_user")
                .values({ id, content: data.role.value.content })
                .execute();
        } else if (data.role.kind === "assistant") {
            await tx.insertInto("chat_message_role_assistant")
                .values({ id, content: data.role.value.content ?? null, refusal: data.role.value.refusal ?? null })
                .execute();
        } else if (data.role.kind === "tool") {
            await tx.insertInto("chat_message_role_tool")
                .values({ id, content: data.role.value.content, tool_call_id: data.role.value.tool_call_id })
                .execute();
        } else {
            return {
                status: "NotImplemented",
                message: `Role not implemented: ${(data.role as { kind: never }).kind satisfies never}`,
            };
        }

        return {
            status: "OK",
            data: null,
        };
    });
});