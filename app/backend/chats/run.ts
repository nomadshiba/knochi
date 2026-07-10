import { encodeBase32 } from "@std/encoding";
import { v7 } from "@std/uuid";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ChatAssistantDelta } from "~/backend/handlers/chats/messages/ChatAssistantStream.ts";
import { renderToolCallContent, renderToolCallSummary, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";
import { ProviderStream, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";

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
            content: { kind: "assistant", value: { partial: true, content: "", refusal: "", tool_calls: [] } },
            created: new Date(now),
        };
        await chat.pushMessage(message);

        let providerDone: ProviderStream & { kind: "done" } | undefined;
        const done = async (delta: ChatAssistantDelta) => {
            await chat.pushStream({ id: message.id, delta });
        };

        try {
            const stream = model.provider.chatStream({
                model: model.name,
                messages: chat.messages,
                tools: toolDefinitions,
                reasoning_effort: "none",
            });
            for await (const delta of stream) {
                const { kind } = delta;
                switch (kind) {
                    case "text":
                    case "refusal": {
                        await chat.pushStream({ id: message.id, delta: { kind, value: delta.value } });
                        break;
                    }
                    case "reasoning": {
                        // TODO: handle it
                        console.log("reasoning", delta.value);
                        break;
                    }
                    case "tool_call": {
                        let call = message.content.value.tool_calls[delta.value.index];
                        if (!call) {
                            const id = `call${encodeBase32(crypto.getRandomValues(new Uint8Array(8)))}`;
                            await chat.pushStream({
                                id: message.id,
                                delta: { kind: "tool_call_new", value: { id, index: delta.value.index } },
                            });
                            call = message.content.value.tool_calls[delta.value.index]!;
                        }

                        const summary = renderToolCallSummary({
                            id: call.value.id,
                            type: "function",
                            function: { name: call.value.name, arguments: call.value.arguments },
                        });
                        const summaryChanged = summary !== call.value.display.summary;
                        if (summaryChanged) call.value.display.summary = summary;

                        await chat.pushStream({
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
            await done({ kind: "done", value: { kind: "fail", value: String(reason) } });
            return;
        }

        if (!message.content.value.tool_calls.length) {
            await done({ kind: "done", value: { kind: "provider", value: providerDone.value.finish_reason } });
            break;
        }

        await Promise.allSettled(message.content.value.tool_calls.map(async (call, index) => {
            await chat.pushStream({
                id: message.id,
                delta: {
                    kind: "tool_call_done",
                    value: {
                        index,
                        display: {
                            content: renderToolCallContent({
                                id: call.value.id,
                                type: "function",
                                function: { name: call.value.name, arguments: call.value.arguments },
                            }),
                        },
                    },
                },
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

            await chat.pushStream({
                id: message.id,
                delta: {
                    kind: "tool_call_result",
                    value: { index, result: { content, display: renderToolResult(call.value.name, content) } },
                },
            });
        }));

        await done({ kind: "done", value: { kind: "provider", value: providerDone.value.finish_reason } });
    }
}
