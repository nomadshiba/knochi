import { db } from "~/backend/database/client.ts";
import { router } from "~/router.ts";

router.registerHandler("GET /v1/settings", async () => {
    const row = await db.selectFrom("settings")
        .where("settings.id", "=", 0)
        .selectAll("settings")
        .executeTakeFirst();

    if (!row) {
        return { status: "NotFound" };
    }

    return {
        status: "OK",
        data: {
            last_provider_id: row.last_provider_id ?? undefined,
            last_model_id: row.last_model_id ?? undefined,
            updated: row.updated,
        },
    };
});