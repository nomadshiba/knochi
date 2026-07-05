import { ProviderToolCall, ProviderToolDefinition, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";
import { Tool } from "~/backend/tools/Tool.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";

const DEFAULT_PERMISSIONS = {
    net: false,
    read: false,
    write: false,
    env: false,
    run: false,
    ffi: false,
    sys: false,
    import: false,
} as const;

export type ScriptToolPermissions = {
    [K in keyof typeof DEFAULT_PERMISSIONS]?: string[] | boolean;
};

const PRELOAD_TIMEOUT_MS = 60_000;
const CODE_BLOCK = "```";

export class ScriptTool extends Tool {
    public readonly definition: ProviderToolDefinition;
    private readonly permissions: ScriptToolPermissions;

    constructor(permissions: ScriptToolPermissions = {}) {
        super();
        this.permissions = Object.assign({}, DEFAULT_PERMISSIONS, permissions);

        this.definition = {
            type: "function",
            function: {
                name: "script",
                description: [
                    `Run TypeScript code in a sandboxed Deno Worker.`,
                    `Permissions: ${JSON.stringify(this.permissions, null, " ")}.`,
                    `Use \`self.onmessage = (e) => {...}\` and call \`self.postMessage(result)\` to return a value.`,
                    `Prefer \`use\` to reuse previous tool results instead of recomputing or re-fetching them — it's cheaper and avoids duplicated work.`,

                    `IMPORTANT: each requested result is keyed by its exact tool_call_id, NOT merged/flattened into e.data directly. ` +
                    `Example: if you pass \`use: ["call_abc123"]\` and that earlier tool call's raw result was the JSON \`{"notes": [...]}\`, ` +
                    `then inside the worker you must access it as \`e.data["call_abc123"].notes\` — \`e.data.notes\` will be undefined. ` +
                    `If \`use\` is empty/omitted, \`e.data\` is just \`{}\`.`,

                    this.permissions.import && [
                        `If your code imports remote modules, list those exact specifiers in \`preload\` — they'll be fetched/cached first and that time does NOT count against \`timeout\`, only the worker's own startup+execution does.`,
                        ``,
                        `IMPORT SOURCE GUIDANCE (try in this order, don't jump to esm.sh out of habit):`,
                        `1. \`jsr:@scope/name\` — check jsr.io first, it's the Deno-native registry.`,
                        `2. \`npm:package-name\` — most npm packages work directly via Deno's npm compat, try this next for anything not on jsr.`,
                        `3. \`https://esm.sh/...\` — use this if the package isn't on jsr/npm, OR if \`npm:\` fails/errors due to Node-compat issues (native bindings, CJS/ESM interop, missing Node builtins, etc). esm.sh serves a pre-converted browser-ESM build which often works when Deno's npm compat layer chokes on a package — it's a legitimate fallback, not just a last resort to avoid. It's just slower to resolve, so prefer jsr/npm when they actually work.`,
                    ].join("\n"),

                    `Returns the posted value as a string.`,
                ].filter(Boolean).join("\n\n"),
                parameters: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: [
                                `TypeScript code to run in the worker. Use \`self.onmessage = (e) => {...}\` and call \`self.postMessage(result)\` to return.`,
                                `\`e.data\` is an object mapping each requested tool_call_id (from \`use\`) to its result (pre-parsed if JSON) — access as \`e.data["<tool_call_id>"]\`, never assume fields are merged into \`e.data\` directly.`,
                                `Inline any other values directly in the code.`,
                                this.permissions.import &&
                                `You may \`import\` remote modules — try \`jsr:\` first, then \`npm:\`; fall back to \`https://esm.sh/...\` if the package isn't on jsr/npm or if \`npm:\` errors with Node-compat issues. List the exact specifiers in \`preload\` too.`,
                            ].filter(Boolean).join(" "),
                        },
                        use: {
                            type: "array",
                            items: { type: "string" },
                            description:
                                'IDs (tool_call_id) of previous tool results to make available as `e.data["<tool_call_id>"]` (pre-parsed if JSON). Prefer this over recomputing values you already have.',
                        },
                        preload: {
                            type: "array",
                            items: { type: "string" },
                            description:
                                "Import specifiers used by `code` to fetch/cache before running (this warm-up time is NOT counted against `timeout`). " +
                                "Try `jsr:@scope/pkg` first, then `npm:package`; fall back to `https://esm.sh/package` if the package isn't on jsr/npm, or if `npm:` fails due to Node-compat issues (native bindings, CJS/ESM interop, missing builtins) — esm.sh's pre-converted ESM build often works in those cases, it's just slower to resolve.",
                        },
                        timeout: {
                            type: "number",
                            description:
                                "Timeout in seconds for the worker's own startup+execution (after any `preload` warm-up, which doesn't count). You must always pick a value yourself — there is no default. If a run times out, retry with a longer timeout.",
                        },
                    },
                    required: ["code", "timeout"],
                },
            },
        };
    }

    public async execute(chat: ChatClient, call: ProviderToolCall): Promise<ProviderToolMessage> {
        let args: { code?: string; use?: string[]; preload?: string[]; timeout?: number };
        try {
            args = JSON.parse(call.function.arguments);
        } catch {
            return this.toolResult(call, "Error: invalid JSON arguments");
        }

        const code = args.code;
        if (!code) return this.toolResult(call, "Error: missing 'code' argument");

        if (typeof args.timeout !== "number" || !Number.isFinite(args.timeout) || args.timeout <= 0) {
            return this.toolResult(
                call,
                "Error: missing/invalid 'timeout' argument. You must pick a timeout in seconds yourself — there is no default. This budget is for the worker's own startup+execution only (preload warm-up doesn't count).",
            );
        }
        const timeoutMs = args.timeout * 1000;

        const preloadSpecifiers = args.preload ?? [];
        if (preloadSpecifiers.length) {
            const preloadErrors: string[] = [];
            await Promise.all(preloadSpecifiers.map(async (spec) => {
                try {
                    await Promise.race([
                        import(spec),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("preload timed out")), PRELOAD_TIMEOUT_MS)),
                    ]);
                } catch (error) {
                    preloadErrors.push(`${spec}: ${String(error)}`);
                }
            }));
            if (preloadErrors.length) {
                return this.toolResult(call, `Error preloading imports:\n${preloadErrors.join("\n")}`);
            }
        }

        const useIds = args.use ?? [];

        const results: Record<string, unknown> = {};
        for (const message of chat.messages()) {
            if (message.role === "tool") {
                if (useIds.includes(message.tool_call_id)) {
                    results[message.tool_call_id] = this.tryParse(message.content);
                }
            }
        }

        const workerUrl = "data:application/typescript," + encodeURIComponent(code);
        let worker: Worker;
        try {
            worker = new Worker(workerUrl, {
                type: "module",
                deno: {
                    permissions: {
                        net: this.permissions.net ?? false,
                        read: this.permissions.read ?? false,
                        write: this.permissions.write ?? false,
                        env: this.permissions.env ?? false,
                        run: this.permissions.run ?? false,
                        ffi: this.permissions.ffi ?? false,
                        sys: this.permissions.sys ?? false,
                        import: this.permissions.import ?? false,
                    },
                },
            } as WorkerOptions);
        } catch (error) {
            return this.toolResult(call, `Error creating worker: ${String(error)}`);
        }

        return await new Promise<ProviderToolMessage>((resolve) => {
            let settled = false;
            const finish = (msg: ProviderToolMessage) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                resolve(msg);
            };

            const timer = setTimeout(() => {
                finish(
                    this.toolResult(
                        call,
                        `Error: worker timed out after ${args.timeout}s (execution only — any preload warm-up already completed). If your code does network requests or other slow operations, retry with a longer 'timeout'.`,
                    ),
                );
            }, timeoutMs);

            worker.onmessage = (e: MessageEvent) => {
                finish(this.toolResult(call, this.stringify(e.data)));
            };
            worker.onerror = (e: ErrorEvent) => {
                e.preventDefault();
                finish(this.toolResult(call, `Error: ${e.message}`));
            };
            worker.onmessageerror = () => {
                finish(this.toolResult(call, "Error: message error in worker"));
            };
            worker.postMessage(results);
        });
    }

    private tryParse(content: string): unknown {
        try {
            return JSON.parse(content);
        } catch {
            return content;
        }
    }

    private toolResult(call: ProviderToolCall, content: string): ProviderToolMessage {
        return { role: "tool", content, tool_call_id: call.id };
    }

    private stringify(value: unknown): string {
        if (typeof value === "string") return value;
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    override transformCall(call: ProviderToolCall): string {
        const args = call.function.arguments;
        let parsed: { code?: string; use?: string[]; preload?: string[]; timeout?: number };
        try {
            parsed = JSON.parse(args);
        } catch {
            return `~~script~~(${args})`;
        }
        if (!parsed.code) return `~~script~~(${args})`;
        const usePart = parsed.use?.length ? `\n\n**use:** \`${parsed.use.join("`, `")}\`` : "";
        const preloadPart = parsed.preload?.length ? `\n\n**preload:** \`${parsed.preload.join("`, `")}\`` : "";
        const timeoutPart = parsed.timeout ? `\n\n**timeout:** ${parsed.timeout}s` : "";
        return `### script\n\n${CODE_BLOCK}typescript\n${parsed.code}\n${CODE_BLOCK}${usePart}${preloadPart}${timeoutPart}`;
    }

    override transformResult(result: ProviderToolMessage): string {
        return `${CODE_BLOCK}json\n${result.content}\n${CODE_BLOCK}`;
    }
}
