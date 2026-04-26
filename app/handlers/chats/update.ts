import { Updateable } from "@kysely/kysely";
import { db } from "~/database/client.ts";
import { Chat } from "~/database/generated/types.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";

router.registerHandler("PATCH /v1/chats/:chatId", async ({ params, data }) => {
    const id = params.pathname.chatId;
    const now = Date.now();

    return await db.transaction().execute(async (tx): Promise<RouteHandlerResult<RoutesSchema, "PATCH /v1/chats/:chatId">> => {
        const chatValues: Updateable<Chat> = { updated: now };

        if (data.name) {
            chatValues.name = data.name;
        }

        const result = await tx.updateTable("chat")
            .set(chatValues)
            .where("chat.id", "=", id)
            .executeTakeFirstOrThrow();

        if (!result.numUpdatedRows) {
            return { status: "NotFound" };
        }

        return {
            status: "OK",
            data: null,
        };
    });
});