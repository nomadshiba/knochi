import { v7 } from "@std/uuid";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ProviderAssistantMessageDelta, ProviderToolDefinition, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";

const MAX_TOOL_ROUNDS = 100;

export async function runAgent(chat: ChatClient): Promise<void> {
    const { model } = chat;
    if (!model) return;

    const tools = chat.agent.tools;
    const toolDefinitions = tools.length ? tools.map((t): ProviderToolDefinition => t.definition) : undefined;
    const toolsByName = new Map(tools.map((t) => [t.definition.function.name, t] as const));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const messageId = v7.generate();
        chat.pushProviderMessage(messageId, { role: "assistant" });

        let hasToolCalls = false;
        let providerDone: ProviderAssistantMessageDelta & { kind: "done" } | undefined;

        try {
            const stream = model.provider.chatStream({
                model: model.name,
                messages: chat.messages,
                tools: toolDefinitions,
            });
            for await (const delta of stream) {
                if (delta.kind === "tool_call") hasToolCalls = true;
                else if (delta.kind === "done") {
                    providerDone = delta;
                    if (hasToolCalls) continue;
                }
                await chat.pushProviderMessageDelta(messageId, delta);
            }
        } catch (reason) {
            console.error(reason);
            chat.emitter.emit({
                kind: "delta",
                value: {
                    id: messageId,
                    delta: {
                        kind: "done",
                        value: {
                            kind: "fail",
                            value: String(reason),
                        },
                    },
                },
            });
            return;
        }

        const message = chat.messages.getById(messageId);
        if (message?.content.kind !== "assistant") throw new Error("weird");
        // TODO: Fix the ordering issue
        /*
            Ok so since we have an internally different order of streaming event and we include tool results in the calls and stuff.
            We need to way when we convert the request from provider format to codec format and back and etc.

            So ChatClient should accept codec format, not provider format.
            Tools are used by the provider rn, so it should work with provider format.
            RN you can see we are delaying the `done` call if there are tool calls,
            reason for this is so we know when the stream ends and can push the message to the MessageBuffer
            so another issue is above code doesnt work because MessageBuffer doesnnt have the message until done is called.
            this is expected.

            so we gotta remove getById from the MessageBuffer
            since we will build the message in this file, we will only send the converted deltas and messages to the ChatClient
            and since we build the message here we will have its variables as well.

            so the coversion should be done in this file, final result should reach to the ChatClient
        */

        if (!hasToolCalls || !providerDone) break;

        for (const call of message.content.value.tool_calls) {
            const tool = toolsByName.get(call.value.name);

            let toolMessage: ProviderToolMessage;
            if (tool) {
                try {
                    const result = await tool.execute(chat, call);
                    toolMessage = { role: "tool", content: result, tool_call_id: call.value.id };
                } catch (reason) {
                    toolMessage = { role: "tool", content: `Error: ${String(reason)}`, tool_call_id: call.value.id };
                }
            } else {
                toolMessage = { role: "tool", content: `Error: unknown tool "${call.value.name}"`, tool_call_id: call.value.id };
            }

            await chat.pushProviderMessage(v7.generate(), toolMessage);
        }

        await chat.pushProviderMessageDelta(messageId, providerDone);
    }
}
