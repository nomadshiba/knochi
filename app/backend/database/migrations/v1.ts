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
    .addColumn("root_tool_call_id", "text", (col) => col.references("tool_call.call_id").onDelete("cascade"))
    .addColumn("agent", "text", (col) => col.notNull())
    .addColumn("model", "text")
    .addColumn("provider_id", "text", (col) => col.references("provider.id").onDelete("set null"))
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
    .addColumn("partial", "boolean", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("refusal", "text", (col) => col.notNull())
    .execute();

await db.schema.createTable("tool_call").ifNotExists()
    .addColumn("call_id", "text", (col) => col.notNull().unique())
    .addColumn("chat_message_id", "text", (col) => col.notNull().references("chat_message_role_assistant.id"))
    .addColumn("index", "integer", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("arguments", "text", (col) => col.notNull())
    .addColumn("result", "text")
    .addPrimaryKeyConstraint("pk_tool_call", ["chat_message_id", "index"])
    .execute();
