import { Database } from "@db/sqlite";
import { Kysely } from "@kysely/kysely";
import { DenoSqlite3Dialect } from "@marshift/kysely-deno-sqlite3";
import { dirname, join } from "@std/path";
import type { DB } from "./generated/types.ts";
import { DATA_DIR } from "~/env.ts";

const DATABASE_PATH = join(DATA_DIR, "sqlite.db");

await Deno.mkdir(dirname(DATABASE_PATH), { recursive: true });

const database = new Database(DATABASE_PATH, { create: true });
database.int64 = true;
database.exec("PRAGMA journal_mode = WAL;");
database.exec("PRAGMA synchronous = NORMAL;");
database.exec("PRAGMA busy_timeout = 5000;");

const journalMode = database.prepare("PRAGMA journal_mode;").get();
if (journalMode?.journal_mode !== "wal") {
    throw new Error(`Failed to enable WAL mode: got ${journalMode?.journal_mode}`);
}

const synchronous = database.prepare("PRAGMA synchronous;").get();
if (synchronous?.synchronous !== 1) {
    throw new Error(`Failed to set synchronous to NORMAL: got ${synchronous?.synchronous}`);
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
                transformDeep(row);
            }
            return Promise.resolve(args.result);
        },
    }],
});

function isJsonKey(name: string): boolean {
    const first = name[0];
    return first !== undefined && first !== first.toLowerCase();
}

function transformDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            value[i] = transformDeep(value[i]);
        }
        return value;
    }
    if (value !== null && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const name in record) {
            const v = record[name];
            record[name] = isJsonKey(name) && typeof v === "string" ? transformDeep(JSON.parse(v)) : transformDeep(v);
        }
        return record;
    }
    return value;
}
