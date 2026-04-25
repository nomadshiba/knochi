import { db } from "~/database/client.ts";

await db.schema.createTable("provider").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("connection_kind", "text", (col) => col.notNull())
    .addColumn("created", "integer", (col) => col.notNull())
    .addColumn("updated", "integer", (col) => col.notNull())
    .execute();

await db.schema.createTable("provider_connection_kind_oai").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("provider.id").onDelete("cascade"))
    .addColumn("base", "text", (col) => col.notNull())
    .addColumn("key", "text", (col) => col.notNull())
    .execute();

console.log("Migrated V1");
