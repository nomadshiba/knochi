import { db } from "~/database/client.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";

router.registerHandler("POST /v1/chats/:chatId/messages", async ({ params, data }) => {
    const chatId = params.pathname.chatId;
    const id = crypto.randomUUID();
    const now = Date.now();

    return await db.transaction().execute(async (tx): Promise<RouteHandlerResult<RoutesSchema, "POST /v1/chats/:chatId/messages">> => {
        const { kind } = data.content;

        await tx.insertInto("chat_message")
            .values({
                id,
                chat_id: chatId,
                role: data.content.kind,
                created: now,
            })
            .execute();

        if (kind === "system") {
            await tx.insertInto("chat_message_role_system")
                .values({ id, content: data.content.value.content })
                .execute();
        } else if (kind === "user") {
            await tx.insertInto("chat_message_role_user")
                .values({ id, content: data.content.value.content })
                .execute();
        } else if (kind === "assistant") {
            await tx.insertInto("chat_message_role_assistant")
                .values({ id, content: data.content.value.content ?? null, refusal: data.content.value.refusal ?? null })
                .execute();
        } else if (kind === "tool") {
            await tx.insertInto("chat_message_role_tool")
                .values({ id, content: data.content.value.content, tool_call_id: data.content.value.tool_call_id })
                .execute();
        } else {
            return { status: "NotImplemented", message: `Role not implemented: ${kind satisfies never}` };
        }

        return { status: "OK", data: null };
    });
});
