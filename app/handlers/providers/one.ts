import { router } from "~/router.ts";
import { db } from "~/database/client.ts";
import { profile } from "node:console";
import { Codec } from "@nomadshiba/codec";
import { ProviderOutput } from "~/handlers/providers/ProviderOutput.ts";

router.registerHandler("GET /v1/providers/:providerId", async ({ params }) => {
    const provider = await db.selectFrom("provider")
        .where("id", "=", params.pathname.providerId)
        .selectAll("provider")
        .executeTakeFirst();

    if (!provider) {
        return { status: "NotFound" };
    }

    let connection: Codec.InferInput<typeof ProviderOutput>["connection"] | undefined;
    if (provider.connection_kind === "oai") {
        const row = await db.selectFrom("provider_connection_kind_oai")
            .where("id", "=", provider.id)
            .selectAll("provider_connection_kind_oai")
            .executeTakeFirstOrThrow();

        connection = {
            kind: "oai",
            value: {
                base: row.base,
                key: row.key,
            },
        };
    }
    if (!connection) {
        return { status: "NotImplemented" };
    }

    return {
        status: "OK",
        data: {
            id: provider.id,
            name: provider.name,
            connection: {
                kind: provider.connection_kind,
                value: {
                    base: connection.base,
                },
            },
            created: provider.created,
            updated: provider.updated,
        },
    };
});
