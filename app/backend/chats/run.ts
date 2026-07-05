import { ChatClient } from "~/backend/chats/ChatClient.ts";
import {
    ProviderAssistantMessage,
    ProviderChatMessage,
    ProviderToolCall,
    ProviderToolDefinition,
    ProviderToolMessage,
} from "~/backend/providers/ProviderClient.ts";

function transformMessage<T extends ProviderChatMessage>(message: T): ProviderChatMessage & { role: T["role"] } {
    if (message.role === "tool") {
        return {
            role: "tool",
            tool_call_id: message.tool_call_id,
            content: `[tool_call_id: ${message.tool_call_id}]\n${message.content}`,
        };
    }
    return message;
}

const MAX_TOOL_ROUNDS = 16;

export async function runAgent(chat: ChatClient): Promise<void> {
    const { model } = chat;
    if (!model) return;

    const tools = chat.agent.tools;
    const toolDefinitions = tools.length ? tools.map((t): ProviderToolDefinition => t.definition) : undefined;
    const toolsByName = new Map(tools.map((t) => [t.definition.function.name, t] as const));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        chat.emitter.emit({ type: "stream", data: { kind: "text", value: "" } });

        let textBuffer = "";
        let refusalBuffer = "";
        const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>();

        try {
            for await (
                const delta of model.provider.chatStream({
                    model: model.name,
                    messages: chat.messages(transformMessage).toArray(),
                    tools: toolDefinitions,
                })
            ) {
                if (delta.kind === "text") {
                    textBuffer += delta.value;
                    chat.emitter.emit({ type: "stream", data: { kind: "text", value: delta.value } });
                } else if (delta.kind === "refusal") {
                    refusalBuffer += delta.value;
                    chat.emitter.emit({ type: "stream", data: { kind: "refusal", value: delta.value } });
                } else if (delta.kind === "tool_call") {
                    const existing = toolCallBuffers.get(delta.value.index) ??
                        { id: delta.value.id ?? "", name: delta.value.name ?? "", arguments: "" };
                    if (delta.value.id) existing.id = delta.value.id;
                    if (delta.value.name) existing.name = delta.value.name;
                    if (delta.value.arguments) existing.arguments += delta.value.arguments;
                    toolCallBuffers.set(delta.value.index, existing);
                    chat.emitter.emit({
                        type: "stream",
                        data: {
                            kind: "tool_call",
                            value: {
                                index: delta.value.index,
                                id: existing.id,
                                name: existing.name,
                                arguments: existing.arguments,
                            },
                        },
                    });
                }
            }
        } catch (reason) {
            console.error(reason);
            chat.emitter.emit({
                type: "stream",
                data: { kind: "done", value: { finish_reason: `Error: ${String(reason)}` } },
            });
            return;
        }

        const toolCalls: ProviderToolCall[] = [...toolCallBuffers.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, v]) => ({ id: v.id, type: "function" as const, function: { name: v.name, arguments: v.arguments } }));

        const reply: ProviderAssistantMessage = {
            role: "assistant",
            content: textBuffer || null,
            refusal: refusalBuffer || undefined,
            tool_calls: toolCalls.length ? toolCalls : undefined,
        };

        await chat.pushMessage(reply);
        chat.emitter.emit({ type: "stream", data: { kind: "done", value: { finish_reason: null } } });

        if (!toolCalls.length) break;

        for (const call of toolCalls) {
            const tool = toolsByName.get(call.function.name);

            let result: ProviderToolMessage;
            if (tool) {
                try {
                    result = await tool.execute(chat, call);
                } catch (error) {
                    result = { role: "tool", content: `Error: ${String(error)}`, tool_call_id: call.id };
                }
            } else {
                result = { role: "tool", content: `Error: unknown tool "${call.function.name}"`, tool_call_id: call.id };
            }

            await chat.pushMessage(result);
        }
    }
}
