import { Codec } from "@nomadshiba/codec";
import { db } from "~/backend/database/client.ts";
import { router } from "~/router.ts";
import { ChatOutput } from "~/backend/handlers/chats/ChatOutput.ts";

router.registerHandler("GET /v1/chats", async () => {
    const rows = await db.selectFrom("chat")
        .orderBy("created", "desc")
        .selectAll("chat")
        .execute();

    const chats = rows.map((row): Codec.InferInput<typeof ChatOutput> => ({
        id: row.id,
        name: row.name,
        root_message_id: row.root_message_id ?? undefined,
        agent: row.agent,
        model: row.model && row.provider_id ? { name: row.model, providerId: row.provider_id } : undefined,
        created: row.created,
        updated: row.updated,
    }));

    return {
        status: "OK",
        data: chats,
    };
});
