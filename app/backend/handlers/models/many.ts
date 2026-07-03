import { db } from "~/backend/database/client.ts";
import { RouteHandler, RouteHandlerOptions } from "~/libs/Router.ts";
import { RoutesSchema } from "~/routes.ts";
import { router } from "~/router.ts";
import type { _ } from "~/types.ts";
import { getCachedModels } from "~/backend/providers/modelsCache.ts";

async function handleModels({ params }: RouteHandlerOptions<RoutesSchema, "GET /v1/models?provider=:provider", _>) {
    const providerId = params.search.provider;
    let providerIds: string[] = [];

    if (providerId) {
        providerIds = [providerId];
    } else {
        const settings = await db.selectFrom("settings")
            .where("settings.id", "=", 0)
            .select("settings.last_provider_id")
            .executeTakeFirst();
        if (settings?.last_provider_id) {
            providerIds = [settings.last_provider_id];
        }
    }

    const providers = await db.selectFrom("provider")
        .where("provider.id", "in", providerIds)
        .selectAll("provider")
        .execute();

    const models = [];
    for (const row of providers) {
        const providerModels = await getCachedModels(row.id, row.base, row.key);
        for (const m of providerModels) {
            models.push({
                id: m.id,
                name: m.name,
                created: m.created,
                providerId: row.id,
            });
        }
    }

    return { status: "OK", data: models } as const;
}

router.registerHandler("GET /v1/models?provider=:provider", handleModels);
router.registerHandler("GET /v1/models", handleModels as unknown as RouteHandler<RoutesSchema, "GET /v1/models", _>);