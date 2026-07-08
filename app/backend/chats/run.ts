import { v7 } from "@std/uuid";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { ProviderStream, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";

const MAX_TOOL_ROUNDS = 100;

export async function runAgent(chat: ChatClient): Promise<void> {
    const { model } = chat;
    if (!model) return;

    const tools = chat.agent.tools;
    const toolDefinitions = tools.length ? tools.map((t): ProviderToolDefinition => t.definition) : undefined;
    const toolsByName = new Map(tools.map((t) => [t.definition.function.name, t] as const));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const now = Date.now();
        const message: ChatMessageOutput<"assistant"> = {
            id: v7.generate(now),
            content: { kind: "assistant", value: { content: "", refusal: "", tool_calls: [] } },
            created: new Date(now),
        };
        chat.pushMessage(message, { partial: true });

        let providerDone: ProviderStream & { kind: "done" } | undefined;

        try {
            const stream = model.provider.chatStream({
                model: model.name,
                messages: chat.messages,
                tools: toolDefinitions,
            });
            for await (const delta of stream) {
                const { kind } = delta;
                switch (kind) {
                    case "text": {
                        message.content.value.content += delta.value;
                        chat.pushStream({ id: message.id, delta: { kind: "text", value: delta.value } });
                        break;
                    }
                    case "refusal": {
                        message.content.value.refusal += delta.value;
                        chat.pushStream({ id: message.id, delta: { kind: "refusal", value: delta.value } });
                        break;
                    }
                    case "tool_call": {
                        const cache = message.content.value.tool_calls[delta.value.index];
                        let call: ToolCall;
                        if (cache) {
                            call = cache;
                        } else {
                            call = message.content.value.tool_calls[delta.value.index] = {
                                kind: "function",
                                value: {
                                    id: v7.generate(now),
                                    name: "",
                                    arguments: "",
                                    display: { content: "", summary: "" },
                                    result: null,
                                },
                            };
                        }

                        if (!cache) {
                            chat.pushStream({
                                id: message.id,
                                delta: { kind: "tool_call_new", value: { id: call.value.id, index: delta.value.index } },
                            });
                        }

                        if (delta.value.name) call.value.name += delta.value.name;
                        if (delta.value.arguments) call.value.arguments += delta.value.arguments;

                        const summary = renderToolCallSummary({
                            id: call.value.id,
                            type: "function",
                            function: { name: call.value.name, arguments: call.value.arguments },
                        });
                        const summaryChanged = summary !== call.value.display.summary;
                        if (summaryChanged) call.value.display.summary = summary;

                        chat.pushStream({
                            id: message.id,
                            delta: {
                                kind: "tool_call_delta",
                                value: {
                                    index: delta.value.index,
                                    name: delta.value.name ?? "",
                                    arguments: delta.value.arguments ?? "",
                                    display: summaryChanged ? { summary } : null,
                                },
                            },
                        });
                        break;
                    }
                    case "done": {
                        providerDone = delta;
                        break;
                    }
                    default: {
                        throw new Error(`Unhandled provider delta kind: ${kind satisfies never}`);
                    }
                }
            }

            if (!providerDone) throw new Error("Stream ended without calling 'done'");
        } catch (reason) {
            console.error(reason);
            chat.messages.add(message);
            chat.pushStream({
                id: message.id,
                delta: { kind: "done", value: { kind: "fail", value: String(reason) } },
            });
            return;
        }

        if (!message.content.value.tool_calls.length) {
            chat.messages.add(message);
            await chat.pushStream({
                id: message.id,
                delta: { kind: "done", value: { kind: "provider", value: providerDone.value.finish_reason } },
            });
            break;
        }

        await Promise.allSettled(message.content.value.tool_calls.map(async (call, index) => {
            call.value.display.content = renderToolCallContent({
                id: call.value.id,
                type: "function",
                function: { name: call.value.name, arguments: call.value.arguments },
            });
            await chat.pushStream({
                id: message.id,
                delta: { kind: "tool_call_done", value: { index, display: call.value.display } },
            });
            const tool = toolsByName.get(call.value.name);

            let content: string;
            if (tool) {
                try {
                    content = await tool.execute(chat, call);
                } catch (reason) {
                    content = `Error: ${String(reason)}`;
                }
            } else {
                content = `Error: unknown tool "${call.value.name}"`;
            }

            call.value.result = { content, display: renderToolResult(call.value.name, content) };
            await chat.pushStream({
                id: message.id,
                delta: { kind: "tool_call_result", value: { index, result: call.value.result } },
            });
        }));

        chat.messages.add(message);
        await chat.pushStream({
            id: message.id,
            delta: { kind: "done", value: { kind: "provider", value: providerDone.value.finish_reason } },
        });
    }
}
