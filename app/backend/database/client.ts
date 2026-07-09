import {
    CompiledQuery,
    type DatabaseConnection,
    type Dialect,
    Kysely,
    type QueryResult,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
} from "@kysely/kysely";
import { DB as Database, type QueryParameterSet } from "@pomdtr/sqlite";
import { dirname, join } from "@std/path";
import { DATA_DIR } from "~/env.ts";
import type { DB } from "./generated/types.ts";

const DATABASE_PATH = join(DATA_DIR, "sqlite.db");

await Deno.mkdir(dirname(DATABASE_PATH), { recursive: true });

const database = new Database(DATABASE_PATH, { mode: "create" });
database.execute("PRAGMA synchronous = NORMAL;");
database.execute("PRAGMA busy_timeout = 5000;");

const [synchronous] = database.queryEntries<{ synchronous: number }>("PRAGMA synchronous;");
if (synchronous?.synchronous !== 1) {
    throw new Error(`Failed to set synchronous to NORMAL: got ${synchronous?.synchronous}`);
}

export const dialect = createWasmSqliteDialect(database);
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

function createConnection(db: Database): DatabaseConnection {
    return {
        executeQuery<R>({ sql, parameters }: CompiledQuery): Promise<QueryResult<R>> {
            const query = db.prepareQuery(sql);
            try {
                const rows = query.allEntries(parameters as QueryParameterSet) as R[];
                return Promise.resolve({
                    rows,
                    numAffectedRows: BigInt(db.changes),
                    insertId: BigInt(db.lastInsertRowId),
                });
            } finally {
                query.finalize();
            }
        },
        // deno-lint-ignore require-yield
        async *streamQuery(): AsyncIterableIterator<never> {
            throw new Error("streaming not supported");
        },
    };
}

function createWasmSqliteDialect(db: Database): Dialect {
    const connection = createConnection(db);
    let lock: Promise<void> = Promise.resolve();
    let release: (() => void) | undefined;
    return {
        createAdapter() {
            return new SqliteAdapter();
        },
        createDriver() {
            return {
                init() {
                    return Promise.resolve();
                },
                async acquireConnection() {
                    const prev = lock;
                    let resolveNext!: () => void;
                    lock = new Promise<void>(function (resolve) {
                        resolveNext = resolve;
                    });
                    await prev;
                    release = resolveNext;
                    return connection;
                },
                releaseConnection() {
                    const resolve = release;
                    release = undefined;
                    resolve?.();
                    return Promise.resolve();
                },
                async beginTransaction(c) {
                    await c.executeQuery(CompiledQuery.raw("BEGIN"));
                },
                async commitTransaction(c) {
                    await c.executeQuery(CompiledQuery.raw("COMMIT"));
                },
                async rollbackTransaction(c) {
                    await c.executeQuery(CompiledQuery.raw("ROLLBACK"));
                },
                destroy() {
                    return Promise.resolve();
                },
            };
        },
        createIntrospector(db) {
            return new SqliteIntrospector(db);
        },
        createQueryCompiler() {
            return new SqliteQueryCompiler();
        },
    };
}
