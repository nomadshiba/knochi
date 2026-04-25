import { Database } from "@db/sqlite";
import { Kysely } from "@kysely/kysely";
import { DenoSqlite3Dialect } from "@marshift/kysely-deno-sqlite3";
import { dirname } from "@std/path";
import { DATABASE_PATH } from "~/config.ts";
import type { DB } from "./generated/types.ts";

await Deno.mkdir(dirname(DATABASE_PATH), { recursive: true });

const database = new Database(DATABASE_PATH, { create: true });
database.int64 = true;
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA synchronous = NORMAL;");

const journalMode = database.prepare("PRAGMA journal_mode;").get() as { journal_mode: string };
if (journalMode.journal_mode !== "wal") {
    throw new Error(`Failed to enable WAL mode: got ${journalMode.journal_mode}`);
}

const synchronous = database.prepare("PRAGMA synchronous;").get() as { synchronous: number };
if (synchronous.synchronous !== 1) {
    throw new Error(`Failed to set synchronous to NORMAL: got ${synchronous.synchronous}`);
}

export const dialect = new DenoSqlite3Dialect({ database });
export const db = new Kysely<DB>({
    dialect,
    plugins: [{
        transformQuery(args) {
            return args.node;
        },
        transformResult(args) {
            for (const row of args.result.rows) {
                for (const name in row) {
                    const value = row[name];
                    if (name.startsWith(name[0].toUpperCase()) && typeof value === "string") {
                        row[name] = JSON.parse(value);
                    } else {
                        row[name] = value;
                    }
                }
            }
            return Promise.resolve(args.result);
        },
    }],
});
