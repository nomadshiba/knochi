import { v7 } from "@std/uuid";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { renderToolCallSummary } from "~/backend/handlers/chats/messages/utils.ts";
import {
    ProviderAssistantMessage,
    ProviderChatMessage,
    ProviderToolCall,
    ProviderToolDefinition,
    ProviderToolMessage,
} from "~/backend/providers/ProviderClient.ts";

function transformMessage(message: ProviderChatMessage): ProviderChatMessage {
    if (message.role === "tool") {
        return {
            role: "tool",
            tool_call_id: message.tool_call_id,
            content: `[tool_call_id:${JSON.stringify(message.tool_call_id)}]\n${message.content}`,
        };
    }
    return message;
}

const MAX_TOOL_ROUNDS = 100;

export async function runAgent(chat: ChatClient): Promise<void> {
    const { model } = chat;
    if (!model) return;

    const tools = chat.agent.tools;
    const toolDefinitions = tools.length ? tools.map((t): ProviderToolDefinition => t.definition) : undefined;
    const toolsByName = new Map(tools.map((t) => [t.definition.function.name, t] as const));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Minted up-front so every "stream" delta for this in-progress assistant message can be
        // correlated with each other, and with the final "message" event once it's persisted —
        // the frontend keys its placeholder bubble on this id and swaps it out the same way it
        // already replaces-or-appends any other message by id.
        const messageId = v7.generate();
        chat.emitter.emit({ kind: "stream", value: { id: messageId, delta: { kind: "text", value: "" } } });

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
                    chat.emitter.emit({ kind: "stream", value: { id: messageId, delta: { kind: "text", value: delta.value } } });
                } else if (delta.kind === "refusal") {
                    refusalBuffer += delta.value;
                    chat.emitter.emit({ kind: "stream", value: { id: messageId, delta: { kind: "refusal", value: delta.value } } });
                } else if (delta.kind === "tool_call") {
                    // We mint our own id instead of trusting the provider's `delta.value.id` — it's used as
                    // `chat_message_role_assistant_toolcall.id` (our primary key), and some providers just
                    // hand back small per-turn indexes (e.g. "0", "1") which would collide across messages.
                    const existing = toolCallBuffers.get(delta.value.index) ??
                        { id: v7.generate(), name: delta.value.name ?? "", arguments: "" };
                    if (delta.value.name) existing.name = delta.value.name;
                    if (delta.value.arguments) existing.arguments += delta.value.arguments;
                    toolCallBuffers.set(delta.value.index, existing);

                    // No real way to "delta" a rendered summary as arguments stream in (partial JSON) —
                    // just re-render it off the accumulated buffer each time, same as `name`/`arguments`
                    // above (also resent in full every delta). The full `content` is NOT rendered here
                    // (see ChatStreamOutput.ts) — the frontend shows the raw `arguments` itself instead.
                    const partialCall: ProviderToolCall = {
                        id: existing.id,
                        type: "function",
                        function: { name: existing.name, arguments: existing.arguments },
                    };
                    chat.emitter.emit({
                        kind: "stream",
                        value: {
                            id: messageId,
                            delta: {
                                kind: "tool_call",
                                value: {
                                    index: delta.value.index,
                                    id: existing.id,
                                    name: existing.name,
                                    arguments: existing.arguments,
                                    display: { summary: renderToolCallSummary(partialCall) },
                                },
                            },
                        },
                    });
                }
            }
        } catch (reason) {
            console.error(reason);
            chat.emitter.emit({
                kind: "stream",
                value: { id: messageId, delta: { kind: "done", value: { finish_reason: `Error: ${String(reason)}` } } },
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

        chat.emitter.emit({ kind: "stream", value: { id: messageId, delta: { kind: "done", value: { finish_reason: null } } } });
        await chat.pushMessage(reply, { id: messageId });
        if (!toolCalls.length) break;

        for (const call of toolCalls) {
            const tool = toolsByName.get(call.function.name);

            let result: ProviderToolMessage;
            if (tool) {
                try {
                    result = await tool.execute(chat, call);
                } catch (reason) {
                    result = { role: "tool", content: `Error: ${String(reason)}`, tool_call_id: call.id };
                }
            } else {
                result = { role: "tool", content: `Error: unknown tool "${call.function.name}"`, tool_call_id: call.id };
            }

            await chat.pushMessage(result);
        }
    }
}
