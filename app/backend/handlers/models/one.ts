import { db } from "~/backend/database/client.ts";
import { RouteHandler, RouteHandlerOptions } from "~/libs/Router.ts";
import { RoutesSchema } from "~/routes.ts";
import { router } from "~/router.ts";
import type { _ } from "~/types.ts";
import { getCachedModels } from "~/backend/providers/modelsCache.ts";

async function handleModel({ params }: RouteHandlerOptions<RoutesSchema, "GET /v1/models/:modelName?provider=:provider", _>) {
    const modelName = params.pathname.modelName;
    const providerId = params.search.provider;

    let providerRow;
    if (providerId) {
        providerRow = await db.selectFrom("provider")
            .where("provider.id", "=", providerId)
            .selectAll("provider")
            .executeTakeFirst();
    } else {
        const settings = await db.selectFrom("settings")
            .where("settings.id", "=", 0)
            .select("settings.last_provider_id")
            .executeTakeFirst();
        if (settings?.last_provider_id) {
            providerRow = await db.selectFrom("provider")
                .where("provider.id", "=", settings.last_provider_id)
                .selectAll("provider")
                .executeTakeFirst();
        }
    }

    if (!providerRow) {
        return { status: "NotFound", message: "No provider selected" } as const;
    }

    const models = await getCachedModels(providerRow.id, providerRow.base, providerRow.key);
    const model = models.find((m) => m.id === modelName || m.name === modelName);
    if (!model) {
        return { status: "NotFound", message: `Model not found: ${modelName}` } as const;
    }

    return {
        status: "OK",
        data: {
            id: model.id,
            name: model.name,
            created: model.created,
            providerId: providerRow.id,
        },
    } as const;
}

router.registerHandler("GET /v1/models/:modelName?provider=:provider", handleModel);
router.registerHandler("GET /v1/models/:modelName", handleModel as unknown as RouteHandler<RoutesSchema, "GET /v1/models/:modelName", _>);