import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { ProviderToolCall, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";
import { Tool } from "~/backend/tools/Tool.ts";

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

                    `You can call any of your tools (including \`script\` itself, e.g. for nested/recursive runs) from inside the worker: they're exposed on the global \`tools\` object as async functions, e.g. \`const result = await tools.someToolName(args)\`. ` +
                    `\`args\` is whatever object that tool's own parameters schema expects (same schema you already see for it as a top-level tool). Each call returns a Promise that resolves with the tool's result (JSON-parsed if possible, otherwise the raw string) or rejects with an Error if the tool call fails. ` +
                    `These calls run for real (against the live chat), count toward this worker's own \`timeout\`, and don't show up as separate messages in the conversation — only this script's own final posted result does. \`tools\` is a reserved global name, don't shadow it.`,

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
                        summary: {
                            type: "string",
                            description:
                                'A short (3-6 word) human-readable summary of what this script call does, e.g. "list open PRs" or "parse CSV and sum totals". Shown as this call\'s label in the UI, so keep it short and descriptive.',
                        },
                        code: {
                            type: "string",
                            description: [
                                `TypeScript code to run in the worker. Use \`self.onmessage = (e) => {...}\` and call \`self.postMessage(result)\` to return.`,
                                `\`e.data\` is an object mapping each requested tool_call_id (from \`use\`) to its result (pre-parsed if JSON) — access as \`e.data["<tool_call_id>"]\`, never assume fields are merged into \`e.data\` directly.`,
                                `Inline any other values directly in the code.`,
                                `Call your other tools with \`await tools.<toolName>(args)\` (returns a Promise). \`tools\` is a reserved global name.`,
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
                    required: ["summary", "code", "timeout"],
                },
            },
        };
    }

    public async execute(chat: ChatClient, call: ToolCall): Promise<string> {
        let args: { summary?: string; code?: string; use?: string[]; preload?: string[]; timeout?: number };
        try {
            args = JSON.parse(call.value.arguments);
        } catch {
            return this.toolResult(call, "Error: invalid JSON arguments");
        }

        if (!args.summary) return this.toolResult(call, "Error: missing 'summary' argument");

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
                } catch (reason) {
                    preloadErrors.push(`${spec}: ${String(reason)}`);
                }
            }));
            if (preloadErrors.length) {
                return this.toolResult(call, `Error preloading imports:\n${preloadErrors.join("\n")}`);
            }
        }

        const useIds = args.use ?? [];

        const results: Record<string, unknown> = {};
        const iter = chat.messages.iter();
        while (true) {
            const { value: message, done } = iter.next();
            if (done) break;
            if (message.content.kind === "assistant") {
                for (const toolCall of message.content.value.tool_calls) {
                    if (useIds.includes(toolCall.value.id) && toolCall.value.result) {
                        results[toolCall.value.id] = this.tryParse(toolCall.value.result.content);
                    }
                }
            }
        }

        const boundTools = chat.agent.tools;

        const workerUrl = "data:application/typescript," + encodeURIComponent(this.buildBridge(boundTools) + code);
        let worker: Worker;
        try {
            worker = new Worker(workerUrl, {
                type: "module",
                deno: {
                    permissions: {
                        net: this.permissions.net,
                        read: this.permissions.read,
                        write: this.permissions.write,
                        env: this.permissions.env,
                        run: this.permissions.run,
                        ffi: this.permissions.ffi,
                        sys: this.permissions.sys,
                        import: this.permissions.import,
                    },
                },
            } as WorkerOptions);
        } catch (reason) {
            return this.toolResult(call, `Error creating worker: ${String(reason)}`);
        }

        const { port1: toolPort, port2: workerToolPort } = new MessageChannel();

        return await new Promise<string>((resolve) => {
            let settled = false;
            const finish = (msg: string) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                toolPort.close();
                workerToolPort.close();
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

            toolPort.onmessage = (e: MessageEvent) => {
                void this.handleBoundToolCall(chat, call, boundTools, e.data).then((response) => {
                    if (settled) return;
                    toolPort.postMessage(response);
                });
            };

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
            worker.postMessage(results, [workerToolPort]);
        });
    }

    /** Handles a `{ id, name, args }` request posted from the worker's `tools.<name>(args)` bridge, invoking the matching bound tool for real. */
    private async handleBoundToolCall(
        chat: ChatClient,
        call: ToolCall,
        boundTools: Tool[],
        request: unknown,
    ): Promise<{ id: string; ok: boolean; value?: unknown; error?: string }> {
        const { id, name, args } = (request ?? {}) as { id?: string; name?: string; args?: unknown };
        if (typeof id !== "string" || typeof name !== "string") {
            return { id: typeof id === "string" ? id : "", ok: false, error: "Malformed tool call request from worker" };
        }

        const tool = boundTools.find((t) => t.definition.function.name === name);
        if (!tool) return { id, ok: false, error: `Unknown tool "${name}"` };

        const syntheticCall: ToolCall = {
            kind: "function",
            value: {
                id: call.value.id,
                name,
                arguments: JSON.stringify(args ?? {}),
                display: { summary: "", content: "" },
                result: null,
            },
        };

        try {
            const result = await tool.execute(chat, syntheticCall);
            return { id, ok: true, value: this.tryParse(result) };
        } catch (reason) {
            return { id, ok: false, error: String(reason) };
        }
    }

    /**
     * Builds the code prepended to the worker script that bridges `boundTools` in as global async
     * `tools.<name>(args)` functions, RPC-ing over a dedicated `MessagePort` (transferred alongside the
     * worker's initial `postMessage`) so it never interferes with the script's own `self.onmessage`/`self.postMessage`.
     */
    private buildBridge(boundTools: Tool[]): string {
        const names = boundTools.map((tool) => tool.definition.function.name);
        const entries = names.map((name) => `    ${JSON.stringify(name)}: (args) => __callTool(${JSON.stringify(name)}, args),`).join("\n");
        return [
            "{",
            "let __toolPort;",
            "const __pending = new Map();",
            "const __queue = [];",
            "let __seq = 0;",
            "function __flush() {",
            "    if (!__toolPort) return;",
            "    while (__queue.length) __toolPort.postMessage(__queue.shift());",
            "}",
            'self.addEventListener("message", (e) => {',
            "    if (__toolPort || !e.ports || !e.ports.length) return;",
            "    __toolPort = e.ports[0];",
            "    __toolPort.onmessage = (ev) => {",
            "        const { id, ok, value, error } = ev.data ?? {};",
            "        const pending = __pending.get(id);",
            "        if (!pending) return;",
            "        __pending.delete(id);",
            '        if (ok) pending.resolve(value); else pending.reject(new Error(error ?? "tool call failed"));',
            "    };",
            "    __flush();",
            "});",
            "function __callTool(name, args) {",
            "    return new Promise((resolve, reject) => {",
            "        const id = `t${++__seq}`;",
            "        __pending.set(id, { resolve, reject });",
            "        const msg = { id, name, args };",
            "        if (__toolPort) __toolPort.postMessage(msg); else __queue.push(msg);",
            "    });",
            "}",
            `globalThis.tools = {\n${entries}\n};`,
            "}",
            "",
        ].join("\n");
    }

    private tryParse(content: string): unknown {
        try {
            return JSON.parse(content);
        } catch {
            return content;
        }
    }

    private toolResult(_call: ToolCall, content: string): string {
        return content;
    }

    private stringify(value: unknown): string {
        if (typeof value === "string") return value;
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    override renderCallSummary(call: ProviderToolCall): string {
        const args = call.function.arguments;
        let parsed: { summary?: string; timeout?: number };
        try {
            parsed = JSON.parse(args);
        } catch {
            return "**script**";
        }
        const label = parsed.summary ? `**script:** ${parsed.summary}` : "**script**";
        return parsed.timeout ? `${label} (${parsed.timeout}s)` : label;
    }

    override renderCallContent(call: ProviderToolCall): string {
        const args = call.function.arguments;
        let parsed: { summary?: string; code?: string; use?: string[]; preload?: string[]; timeout?: number };
        try {
            parsed = JSON.parse(args);
        } catch {
            return `~~script~~(${args})`;
        }
        if (!parsed.code) return `~~script~~(${args})`;
        const summaryPart = parsed.summary ? `**summary:** ${parsed.summary}\n\n` : "";
        const usePart = parsed.use?.length ? `**use:** \`${parsed.use.join("`, `")}\`` : "";
        const preloadPart = parsed.preload?.length ? `**preload:** \`${parsed.preload.join("`, `")}\`` : "";
        const timeoutPart = parsed.timeout ? `**timeout:** ${parsed.timeout}s` : "";
        const codePart = `**code:**\n${CODE_BLOCK}typescript\n${parsed.code}\n${CODE_BLOCK}`;
        return [summaryPart, timeoutPart, usePart, preloadPart, codePart].join("\n\n");
    }

    override renderResult(content: string): string {
        return `${CODE_BLOCK}json\n${content}\n${CODE_BLOCK}`;
    }
}
