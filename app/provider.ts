export type ProviderModel = { name: string; id: string; created: number };
export type ProviderChatOutput = OAIAssistantMessage;

export type ProviderTool = {
    name: string;
    description?: string;
    parameters: Record<string, unknown>; // JSON Schema object
};

export type ProviderChatInput = {
    model: string;
    messages: OAIChatMessage[];
    temperature?: number;
    max_tokens?: number;
    tools?: ProviderTool[];
    tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
};

export type ProviderClient = {
    chat(options: ProviderChatInput): Promise<ProviderChatOutput>;
    models(): Promise<ProviderModel[]>;
};

export function createOAIProviderClient(options: { base: string; key: string }): ProviderClient {
    const base = options.base.replace(/\/+$/, "");
    const headers = {
        "Authorization": `Bearer ${options.key}`,
        "Content-Type": "application/json",
    };

    return {
        async chat(input): Promise<ProviderChatOutput> {
            const body = {
                model: input.model,
                messages: input.messages,
                temperature: input.temperature,
                max_tokens: input.max_tokens,
                stream: false,
                tools: input.tools?.map((t) => ({
                    type: "function",
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })),
                tool_choice: input.tool_choice,
            };

            const response = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`OAI chat completions error ${response.status}: ${text}`);
            }

            const output = await response.json() as OAIChatResponse<"assistant">;

            return output.choices[0].message;
        },

        async models() {
            const res = await fetch(`${base}/models`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${options.key}` },
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`OAI list models error ${res.status}: ${text}`);
            }

            const json = await res.json() as { data: { id: string; object: string; created: number; owned_by: string }[] };
            return json.data.map((model) => ({ id: model.id, name: model.id, created: model.created * 1000 }));
        },
    };
}

type OAIToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};

type OAIToolDefinition = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
};

type OAISystemMessage = { role: "system"; content: string };
type OAIUserMessage = { role: "user"; content: string };
type OAIAssistantMessage = { role: "assistant"; content?: string | null; refusal?: string | null; tool_calls?: OAIToolCall[] };
type OAIToolMessage = { role: "tool"; content: string; tool_call_id: string };

type OAIChatMessage =
    | OAISystemMessage
    | OAIUserMessage
    | OAIAssistantMessage
    | OAIToolMessage;

type OAIChatChoice<TRole extends OAIChatMessage["role"] = OAIChatMessage["role"]> = {
    index: number;
    message: OAIChatMessage & { role: TRole };
    finish_reason: string | null;
};

type OAIChatResponse<TRole extends OAIChatMessage["role"] = OAIChatMessage["role"]> = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: [OAIChatChoice<TRole>, ...OAIChatChoice<TRole>[]];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};
