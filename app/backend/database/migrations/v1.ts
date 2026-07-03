import { db } from "~/backend/database/client.ts";

await db.schema.createTable("provider").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("base", "text", (col) => col.notNull())
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("created", "integer", (col) => col.notNull())
    .addColumn("updated", "integer", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("root_message_id", "text", (col) => col.references("chat_message.id").onDelete("cascade"))
    .addColumn("created", "integer", (col) => col.notNull())
    .addColumn("updated", "integer", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chat.id").onDelete("cascade"))
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("created", "integer", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_system").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message.id").onDelete("cascade"))
    .addColumn("content", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_user").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message.id").onDelete("cascade"))
    .addColumn("content", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_assistant").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message.id").onDelete("cascade"))
    .addColumn("content", "text")
    .addColumn("refusal", "text")
    .execute();

await db.schema.createTable("chat_message_role_assistant_toolcall").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("chat_message_id", "text", (col) => col.references("chat_message_role_assistant.id"))
    .addColumn("type", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_assistant_toolcall_type_function").ifNotExists()
    .addColumn(
        "id",
        "text",
        (col) => col.notNull().primaryKey().references("chat_message_role_assistant_toolcall.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("arguments", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_tool").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message.id").onDelete("cascade"))
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("tool_call_id", "text", (col) => col.notNull().references("chat_message_role_assistant_toolcall.id"))
    .execute();

await db.schema.createTable("settings").ifNotExists()
    .addColumn("id", "integer", (col) => col.notNull().primaryKey())
    .addColumn("last_provider_id", "text", (col) => col.references("provider.id").onDelete("set null"))
    .addColumn("last_model_id", "text")
    .addColumn("updated", "integer", (col) => col.notNull())
    .execute();

await db.insertInto("settings")
    .values({ id: 0, last_provider_id: null, last_model_id: null, updated: Date.now() })
    .onConflict((oc) => oc.doNothing())
    .execute();
