import { dirname, join } from "@std/path";

export const ROOT_DIR = Deno.build.standalone ? dirname(await Deno.realPath(Deno.execPath())) : Deno.cwd();
export const DATA_DIR = join(ROOT_DIR, "data");
export const DATABASE_PATH = join(DATA_DIR, "sqlite.db");
