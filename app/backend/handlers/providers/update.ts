import { Updateable } from "@kysely/kysely";
import { db } from "~/backend/database/client.ts";
import { Provider } from "~/backend/database/generated/types.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { router } from "~/router.ts";
import { RoutesSchema } from "~/routes.ts";
import { invalidateModelsCache } from "~/backend/providers/modelsCache.ts";

router.registerHandler("PATCH /v1/providers/:providerId", async ({ params, data }) => {
    const id = params.pathname.providerId;
    const now = Date.now();

    return await db.transaction().execute(async (tx): Promise<RouteHandlerResult<RoutesSchema, "PATCH /v1/providers/:providerId">> => {
        const providerValues: Updateable<Provider> = { updated: now };

        if (data.name) {
            providerValues.name = data.name;
        }

        if (data.base) {
            providerValues.base = data.base.href;
        }

        if (data.key) {
            providerValues.key = data.key;
        }

        const result = await tx.updateTable("provider")
            .set(providerValues)
            .where("provider.id", "=", id)
            .executeTakeFirstOrThrow();

        if (!result.numUpdatedRows) {
            return { status: "NotFound" };
        }

        invalidateModelsCache(id);

        return {
            status: "OK",
            data: null,
        };
    });
});
