import { db } from "~/database/client.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";

router.registerHandler("POST /v1/chats", async ({ data }) => {
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.insertInto("chat")
        .values({
            id,
            name: data.name,
            root_message_id: null,
            created: now,
            updated: now,
        })
        .execute();

    return {
        status: "OK",
        data: null,
    } satisfies RouteHandlerResult<RoutesSchema, "POST /v1/chats">;
});