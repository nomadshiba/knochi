import { db } from "~/database/client.ts";
import { router } from "~/router.ts";

router.registerHandler("DELETE /v1/chats/:chatId/messages/:messageId", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const messageId = params.pathname.messageId;

    const result = await db.deleteFrom("chat_message")
        .where("chat_message.id", "=", messageId)
        .where("chat_message.chat_id", "=", chatId)
        .executeTakeFirstOrThrow();

    if (!result.numDeletedRows) {
        return { status: "NotFound" };
    }

    return { status: "OK", data: null };
});