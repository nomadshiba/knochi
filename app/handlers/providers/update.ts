import { db } from "~/database/client.ts";
import { router } from "~/router.ts";
import { RouteHandlerResult } from "~/libs/Router.ts";
import { RoutesSchema } from "~/routes.ts";
import { Updateable } from "@kysely/kysely";
import { Provider } from "~/database/generated/types.ts";
import { Codec } from "@nomadshiba/codec";
import { ProviderOutput } from "~/handlers/providers/ProviderOutput.ts";

router.registerHandler("PATCH /v1/providers/:providerId", async ({ params, data }) => {
    const id = params.pathname.providerId;
    const now = Date.now();

    return await db.transaction().execute(async (tx): Promise<RouteHandlerResult<RoutesSchema, "PATCH /v1/providers/:providerId">> => {
        const providerValues: Updateable<Provider> = { updated: now };

        if (data.name) {
            providerValues.name = data.name;
        }

        if (data.connection) {
            providerValues.connection_kind = data.connection.kind;
        }

        const providerRow = await tx.updateTable("provider")
            .set(providerValues)
            .returningAll()
            .executeTakeFirst();

        if (!providerRow) {
            return { status: "NotFound" };
        }

        let connection: Codec.InferInput<typeof ProviderOutput>["connection"];
        if (data.connection) {
            providerValues.connection_kind = data.connection.kind;

            if (data.connection.kind === "oai") {
                const connectionRow = await tx.insertInto("provider_connection_kind_oai")
                    .values({
                        id,
                        base: data.connection.value.base.href,
                        key: data.connection.value.key,
                    })
                    .onConflict((oc) =>
                        oc.columns(["id"]).doUpdateSet((eb) => ({
                            base: eb.ref("excluded.base"),
                            key: eb.ref("excluded.key"),
                        }))
                    )
                    .returningAll()
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
                    status: "BadRequest",
                    message: `Invalid connection kind: ${data.connection.kind satisfies never}`,
                };
            }
        } else {
            if (providerRow.connection_kind === "oai") {
                const connectionRow = await db.selectFrom("provider_connection_kind_oai")
                    .where("id", "=", id)
                    .selectAll()
                    .executeTakeFirstOrThrow();

                connection = {
                    kind: providerRow.connection_kind,
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
        }

        return {
            status: "OK",
            data: {
                id,
                name: providerRow.name,
                connection,
                created: providerRow.created,
                updated: providerRow.updated,
            },
        };
    });
});
