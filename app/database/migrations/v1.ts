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

await db.schema.createTable("agent").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("template_kind", "text", (col) => col.notNull())
    .addColumn("created", "integer", (col) => col.notNull())
    .addColumn("updated", "integer", (col) => col.notNull())
    .execute();

await db.schema.createTable("agent_template_kind_default").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("agent.id").onDelete("cascade"))
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
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message_role_assistant_toolcall.id").onDelete("cascade"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("arguments", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("chat_message_role_tool").ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey().references("chat_message.id").onDelete("cascade"))
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("tool_call_id", "text", (col) => col.notNull().references("chat_message_role_assistant_toolcall.id"))
    .execute();

console.log("Migrated V1");
