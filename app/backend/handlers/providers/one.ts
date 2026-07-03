import { db } from "~/backend/database/client.ts";
import { router } from "~/router.ts";

router.registerHandler("GET /v1/providers/:providerId", async ({ params }) => {
    const id = params.pathname.providerId;

    const providerRow = await db.selectFrom("provider")
        .where("provider.id", "=", id)
        .selectAll("provider")
        .executeTakeFirst();

    if (!providerRow) {
        return { status: "NotFound" };
    }

    return {
        status: "OK",
        data: {
            id: providerRow.id,
            name: providerRow.name,
            base: providerRow.base,
            created: providerRow.created,
            updated: providerRow.updated,
        },
    };
});
