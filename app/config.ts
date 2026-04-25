import { join } from "@std/path";

export const DATA_DIR = new URL("./data", import.meta.url).pathname;
export const DATABASE_PATH = join(DATA_DIR, "sqlite.db");
