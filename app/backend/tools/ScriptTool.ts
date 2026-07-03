import { LoadedMessage } from "~/backend/agents/run.ts";
import { ProviderToolCall, ProviderToolDefinition, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";
import { Tool } from "~/backend/tools/Tool.ts";

export type ScriptToolPermissions = {
    net?: boolean | string[];
    read?: boolean | string[];
    write?: boolean | string[];
    env?: boolean;
    run?: boolean;
    ffi?: boolean;
    sys?: boolean;
    import?: boolean;
};

const WORKER_TIMEOUT = 30_000;

export class ScriptTool extends Tool {
    constructor(private readonly permissions: ScriptToolPermissions = {}) {
        super();
    }

    definition(): ProviderToolDefinition {
        return {
            type: "function",
            function: {
                name: "script",
                description:
                    "Run TypeScript code in a sandboxed Deno Worker. The code runs in a Worker with restricted permissions. Use `self.onmessage = (e) => {...}` and call `self.postMessage(result)` to return a value. `e.data.input` is the input string. Previous tool results referenced via `use` are available as `e.data.results[id]` (pre-parsed if JSON). Returns the posted value as a string.",
                parameters: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description:
                                "TypeScript code to run in the worker. Use `self.onmessage = (e) => {...}` and call `self.postMessage(result)` to return. Access previous tool results via `e.data.results[id]`.",
                        },
                        input: {
                            type: "string",
                            description: "Optional input data to pass to the worker via postMessage (e.data).",
                        },
                        use: {
                            type: "array",
                            items: { type: "string" },
                            description: "IDs (tool_call_id) of previous tool results to make available as RESULTS[id] (pre-parsed if JSON).",
                        },
                    },
                    required: ["code"],
                },
            },
        };
    }

    execute(history: LoadedMessage[], call: ProviderToolCall): Promise<ProviderToolMessage> {
        return this.run(call, history);
    }

    override renderCall(_name: string, args: string): string {
        let parsed: { code?: string; use?: string[] };
        try {
            parsed = JSON.parse(args);
        } catch {
            return `~~script~~(${args})`;
        }
        if (!parsed.code) return `~~script~~(${args})`;
        const usePart = parsed.use?.length ? `\n\n**use:** \`${parsed.use.join("`, `")}\`` : "";
        return `### script\n\n\`\`\`typescript\n${parsed.code}\n\`\`\`${usePart}`;
    }

    override renderResult(_name: string, _args: string, result: string): string {
        return `### result\n\n\`\`\`\n${result}\n\`\`\``;
    }

    async run(call: ProviderToolCall, history: LoadedMessage[]): Promise<ProviderToolMessage> {
        let args: { code?: string; input?: string; use?: string[] };
        try {
            args = JSON.parse(call.function.arguments);
        } catch {
            return this.toolResult(call, "Error: invalid JSON arguments");
        }

        const code = args.code;
        if (!code) return this.toolResult(call, "Error: missing 'code' argument");

        const input = args.input ?? "";
        const useIds = args.use ?? [];

        const results: Record<string, unknown> = {};
        for (const msg of history) {
            if (msg.role === "tool" && msg.tool) {
                if (useIds.includes(msg.tool.tool_call_id)) {
                    results[msg.tool.tool_call_id] = this.tryParse(msg.tool.content);
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
                finish(this.toolResult(call, "Error: worker timed out"));
            }, WORKER_TIMEOUT);

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
            worker.postMessage({ input, results });
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
}
