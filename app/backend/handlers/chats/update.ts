import { Updateable } from "@kysely/kysely";
import { agentsByName } from "~/backend/agents/mod.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { db } from "~/backend/database/client.ts";
import { Chat } from "~/backend/database/generated/types.ts";
import { RouteHandlerResult } from "~/libs/routing/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";

router.registerHandler("PATCH /v1/chats/:chatId", async ({ params, data }) => {
    const id = params.pathname.chatId;
    const now = Date.now();

    const values: Updateable<Chat> = { updated: now };
    if (data.name) values.name = data.name;

    const result = await db.updateTable("chat")
        .set(values)
        .where("chat.id", "=", id)
        .executeTakeFirst();

    if (!result.numUpdatedRows) {
        return { status: "NotFound" } satisfies RouteHandlerResult<RoutesSchema, "PATCH /v1/chats/:chatId">;
    }

    // Route agent/model changes through the (possibly already cached & live) ChatClient
    // instance, so an in-flight/just-created chat picks up the change immediately instead
    // of only being visible after the process re-loads the chat from the database.
    if (data.agent || data.model) {
        const chat = await ChatClient.getOrLoad(id);

        if (data.agent) {
            const agent = agentsByName.get(data.agent);
            if (agent) await chat.changeAgent(agent);
        }

        if (data.model) {
            await chat.changeModel(data.model.providerId, data.model.name);
        }
    }

    return {
        status: "OK",
        data: null,
    } satisfies RouteHandlerResult<RoutesSchema, "PATCH /v1/chats/:chatId">;
});
