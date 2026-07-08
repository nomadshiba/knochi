import { db } from "~/backend/database/client.ts";
import { WeakRefMap } from "~/libs/collections/WeakRefMap.ts";
import { ChatMessageBuffer } from "~/backend/chats/ChatMessageBuffer.ts";

export class ProviderClient {
    public readonly id: string;
    public readonly base: string;
    public readonly key: string;

    private constructor(id: string, base: string, key: string) {
        this.id = id;
        this.base = base;
        this.key = key;
    }

    private static cache = new WeakRefMap<string, ProviderClient>();
    private static loading = new Map<string, Promise<ProviderClient | undefined>>();

    /** Loads (or reuses a cached) `ProviderClient` for the given provider `id` — same `id` always yields the same instance. */
    static open(id: string): Promise<ProviderClient | undefined> {
        const cached = this.cache.get(id);
        if (cached) return Promise.resolve(cached);

        const inflight = this.loading.get(id);
        if (inflight) return inflight;

        const promise = db.selectFrom("provider").where("id", "=", id).select(["base", "key"]).executeTakeFirst()
            .then((row) => {
                if (!row) return undefined;
                const client = new ProviderClient(id, row.base, row.key);
                this.cache.set(id, client);
                return client;
            })
            .finally(() => this.loading.delete(id));
        this.loading.set(id, promise);
        return promise;
    }

    /** Drops the cached client for `id` (e.g. after its base/key were edited) — the next `open(id)` re-fetches it. */
    static invalidate(id: string): void {
        this.cache.delete(id);
    }

    private static readonly MODELS_CACHE_TTL_MS = 60_000;
    private modelsCache: { models: ProviderModel[]; expires: number } | undefined;

    async chat(input: ProviderChatInput): Promise<ProviderAssistantMessage> {
        const body = {
            model: input.model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.max_tokens,
            stream: false,
            tools: input.tools,
            tool_choice: input.tool_choice,
        };

        const response = await fetch(`${this.base}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OAI chat completions error ${response.status}: ${text}`);
        }

        const output = await response.json() as ProviderChatResponse<"assistant">;

        return output.choices[0].message;
    }

    async *chatStream(input: ProviderChatInput): AsyncIterable<ProviderAssistantMessageDelta> {
        const body = {
            model: input.model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.max_tokens,
            stream: true,
            tools: input.tools,
            tool_choice: input.tool_choice,
        };

        const response = await fetch(`${this.base}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OAI chat stream error ${response.status}: ${text}`);
        }

        if (!response.body) throw new Error("No response body for stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finishReason: string | null = null;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let newlineIndex: number;
                while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);
                    if (!line) continue;
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;
                        try {
                            const chunk = JSON.parse(data) as ProviderChatStreamChunk;
                            const choice = chunk.choices[0];
                            if (choice.finish_reason) finishReason = choice.finish_reason;
                            const delta = choice.delta;
                            if (delta.content) yield { kind: "text", value: delta.content };
                            if (delta.refusal) yield { kind: "refusal", value: delta.refusal };
                            if (delta.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    yield {
                                        kind: "tool_call",
                                        value: {
                                            index: tc.index,
                                            id: tc.id,
                                            name: tc.function?.name,
                                            arguments: tc.function?.arguments,
                                        },
                                    };
                                }
                            }
                        } catch {
                            // ignore parse errors on partial lines
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        yield { kind: "done", value: { finish_reason: finishReason } };
    }

    async models(): Promise<ProviderModel[]> {
        const now = Date.now();
        if (this.modelsCache && this.modelsCache.expires > now) return this.modelsCache.models;

        const res = await fetch(`${this.base}/models`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${this.key}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OAI list models error ${res.status}: ${text}`);
        }

        const json = await res.json() as { data: { id: string; object: string; created: number; owned_by: string }[] };
        const models = json.data.map((model) => ({ id: model.id, name: model.id, created: (model.created || 0) * 1000 }));
        this.modelsCache = { models, expires: now + ProviderClient.MODELS_CACHE_TTL_MS };
        return models;
    }
}

export type ProviderModel = { name: string; id: string; created: number };

export type ProviderChatInput = {
    model: string;
    messages: ChatMessageBuffer;
    temperature?: number;
    max_tokens?: number;
    tools?: ProviderToolDefinition[];
    tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
};

export type ProviderAssistantMessageDelta =
    | { kind: "text"; value: string }
    | { kind: "refusal"; value: string }
    | { kind: "tool_call"; value: { index: number; id?: string; name?: string; arguments?: string } }
    | { kind: "done"; value: { finish_reason: string | null } };

export type ProviderToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};

export type ProviderToolDefinition = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
};

export type ProviderSystemMessage = { role: "system"; content: string };
export type ProviderUserMessage = { role: "user"; content: string };
export type ProviderAssistantMessage = {
    role: "assistant";
    content?: string | null;
    refusal?: string | null;
    tool_calls?: ProviderToolCall[];
};
export type ProviderToolMessage = { role: "tool"; content: string; tool_call_id: string };

export type ProviderChatMessage =
    | ProviderSystemMessage
    | ProviderUserMessage
    | ProviderAssistantMessage
    | ProviderToolMessage;

type ProviderChatChoice<TRole extends ProviderChatMessage["role"] = ProviderChatMessage["role"]> = {
    index: number;
    message: ProviderChatMessage & { role: TRole };
    finish_reason: string | null;
};

type ProviderChatResponse<TRole extends ProviderChatMessage["role"] = ProviderChatMessage["role"]> = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: [ProviderChatChoice<TRole>, ...ProviderChatChoice<TRole>[]];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};

type ProviderChatStreamChunkDelta = {
    role?: "assistant";
    content?: string | null;
    refusal?: string | null;
    tool_calls?: {
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
    }[];
};

type ProviderChatStreamChunk = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: [{
        index: number;
        delta: ProviderChatStreamChunkDelta;
        finish_reason: string | null;
    }];
};
