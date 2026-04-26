import { db } from "~/database/client.ts";
import { router } from "~/router.ts";

router.registerHandler("DELETE /v1/chats/:chatId", async ({ params }) => {
    const id = params.pathname.chatId;

    const result = await db.deleteFrom("chat")
        .where("chat.id", "=", id)
        .executeTakeFirstOrThrow();

    if (!result.numDeletedRows) {
        return { status: "NotFound" };
    }

    return { status: "OK", data: null };
});