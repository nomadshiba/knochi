import { Codec } from "@nomadshiba/codec";
import { db } from "~/backend/database/client.ts";
import { ProviderOutput } from "~/backend/handlers/providers/ProviderOutput.ts";
import { router } from "~/router.ts";

router.registerHandler("GET /v1/providers", async () => {
    const rows = await db.selectFrom("provider")
        .selectAll()
        .execute();

    const providers: Codec.InferInput<typeof ProviderOutput>[] = [];
    for (const row of rows) {
        providers.push({
            id: row.id,
            name: row.name,
            base: row.base,
            created: row.created,
            updated: row.updated,
        });
    }

    return {
        status: "OK",
        data: providers,
    };
});
