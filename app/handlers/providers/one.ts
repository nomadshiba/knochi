import { Codec } from "@nomadshiba/codec";
import { db } from "~/database/client.ts";
import { ProviderOutput } from "~/handlers/providers/ProviderOutput.ts";
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

    let connection: Codec.InferInput<typeof ProviderOutput>["connection"] | undefined;
    if (providerRow.connection_kind === "oai") {
        const connectionRow = await db.selectFrom("provider_connection_kind_oai")
            .where("id", "=", id)
            .selectAll()
            .executeTakeFirstOrThrow();

        connection = {
            kind: "oai",
            value: {
                base: connectionRow.base,
                key: connectionRow.key,
            },
        };
    } else {
        return {
            status: "NotImplemented",
            message: `Connection kind not implemented: ${providerRow.connection_kind}`,
        };
    }

    return {
        status: "OK",
        data: {
            id: providerRow.id,
            name: providerRow.name,
            connection,
            created: providerRow.created,
            updated: providerRow.updated,
        },
    };
});
