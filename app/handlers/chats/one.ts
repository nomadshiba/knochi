import { Codec } from "@nomadshiba/codec";
import { db } from "~/database/client.ts";
import { router } from "~/router.ts";
import { ChatOutput } from "~/handlers/chats/ChatOutput.ts";

router.registerHandler("GET /v1/chats/:chatId", async ({ params }) => {
    const id = params.pathname.chatId;

    const row = await db.selectFrom("chat")
        .where("chat.id", "=", id)
        .selectAll("chat")
        .executeTakeFirst();

    if (!row) {
        return { status: "NotFound" };
    }

    const chat: Codec.InferInput<typeof ChatOutput> = {
        id: row.id,
        name: row.name,
        root_message_id: row.root_message_id ?? undefined,
        created: row.created,
        updated: row.updated,
    };

    return {
        status: "OK",
        data: chat,
    };
});
