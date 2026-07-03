import { db } from "~/backend/database/client.ts";
import { router } from "~/router.ts";

router.registerHandler("PATCH /v1/settings", async ({ data }) => {
    const values: { last_provider_id?: string | null; last_model_id?: string | null; updated?: number } = {
        updated: Date.now(),
    };

    if ("last_provider_id" in data) {
        values.last_provider_id = data.last_provider_id ?? null;
    }
    if ("last_model_id" in data) {
        values.last_model_id = data.last_model_id ?? null;
    }

    await db.updateTable("settings")
        .set(values)
        .where("settings.id", "=", 0)
        .execute();

    return { status: "OK", data: null };
});