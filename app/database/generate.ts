import * as codegen from "@maheshbansod/kysely-codegen";
import { join } from "@std/path";
import { DATABASE_PATH } from "~/config.ts";
import { dialect } from "./client.ts";

import "./migrate.ts";

const outdir = new URL("./generated/", import.meta.url).pathname;
await Deno.remove(outdir, { recursive: true }).catch(() => {});

const cli = new codegen.Cli();
await cli.generate({
    url: DATABASE_PATH,
    outFile: join(outdir, "types.ts"),
    customKyselyDialect: dialect as never,
    dialectName: "sqlite",
});
