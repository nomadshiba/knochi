import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ProviderChatMessage } from "~/backend/providers/ProviderClient.ts";
import { ChatAssistantDelta } from "~/backend/handlers/chats/messages/ChatAssistantStream.ts";

function toProviderChatMessage(message: ChatMessageOutput): ProviderChatMessage[] {
    const { content } = message;
    const { kind } = content;
    if (kind === "user") {
        return [{ role: "user", content: content.value.content }];
    }
    if (kind === "system") {
        return [{ role: "system", content: content.value.content }];
    }
    if (kind === "assistant") {
        return [
            {
                role: "assistant",
                content: content.value.content,
                refusal: content.value.refusal,
                tool_calls: content.value.tool_calls.map((call) => ({
                    id: call.value.id,
                    type: "function",
                    function: {
                        name: call.value.name,
                        arguments: call.value.arguments,
                    },
                })),
            },
            ...content.value.tool_calls.map((call): ProviderChatMessage | null => {
                if (!call.value.result) return null;
                return {
                    role: "tool",
                    content: `[call_id:${JSON.stringify(call.value.id)}]\n${call.value.result.content}`,
                    tool_call_id: call.value.id,
                };
            }).filter((call) => call !== null),
        ];
    }

    throw new Error(`Unhandled message kind  `);
}

export class ChatMessageBuffer {
    private messages: ChatMessageOutput[];
    private partialMessage: ChatMessageOutput<"assistant"> | null;

    private prefixMessagesJson: string;
    private messagesJson: string;
    private suffixMessagesJson: string;

    private constructor(inital: ChatMessageOutput[]) {
        this.messages = inital;
        this.partialMessage = null;

        this.prefixMessagesJson = "";
        this.messagesJson = JSON.stringify(inital.flatMap(toProviderChatMessage)).slice(1, -1);
        this.suffixMessagesJson = "";
    }

    public static create(initial: ChatMessageOutput[] = []): ChatMessageBuffer {
        return new ChatMessageBuffer(initial);
    }

    public setPrefix(messages: ProviderChatMessage[]) {
        this.prefixMessagesJson = JSON.stringify(messages).slice(1, -1);
    }

    public setSuffix(messages: ProviderChatMessage[]) {
        this.suffixMessagesJson = JSON.stringify(messages).slice(1, -1);
    }

    public push(message: ChatMessageOutput): void {
        if (this.partialMessage) {
            throw new Error(`Can't add new messages while there is a partial message in the queue.`);
        }
        if (message.content.kind === "assistant" && message.content.value.partial) {
            // TODO: https://github.com/microsoft/TypeScript/issues/42384
            this.partialMessage = message as never;
        } else {
            this.messages.push(message);
            if (this.messagesJson) this.messagesJson += ",";
            this.messagesJson += JSON.stringify(toProviderChatMessage(message)).slice(1, -1);
        }
    }

    public delta(delta: ChatAssistantDelta): void {
        if (!this.partialMessage) throw new Error(`Expected partial message`);
        const { content } = this.partialMessage;
        if (delta.kind === "text") content.value.content += delta.value;
        if (delta.kind === "refusal") content.value.refusal += delta.value;
        if (delta.kind === "tool_call_new") {
            content.value.tool_calls[delta.value.index] = {
                kind: "function",
                value: {
                    id: delta.value.id,
                    name: "",
                    arguments: "",
                    display: { summary: "", content: "" },
                    result: { content: "", display: "" },
                },
            };
        }
        if (delta.kind === "tool_call_delta") {
            const call = content.value.tool_calls[delta.value.index]!;
            if (delta.value.name) call.value.name += delta.value.name;
            if (delta.value.arguments) call.value.arguments += delta.value.arguments;
            if (delta.value.display?.summary) call.value.display.summary = delta.value.display.summary;
        }
        if (delta.kind === "tool_call_done") {
            const call = content.value.tool_calls[delta.value.index]!;
            call.value.display.content = delta.value.display.content;
        }
        if (delta.kind === "tool_call_result") {
            const call = content.value.tool_calls[delta.value.index]!;
            call.value.result = delta.value.result;
        }
        if (delta.kind === "done") {
            content.value.partial = false;
            const message = this.partialMessage;
            this.partialMessage = null;
            this.push(message);
        }
    }

    public *iter(): ArrayIterator<ChatMessageOutput> {
        for (const message of this.messages) yield message;
        if (this.partialMessage) yield this.partialMessage;
    }

    public json(): string {
        return "[" +
            [
                this.prefixMessagesJson,
                this.messagesJson,
                // this.partialMessage ? JSON.stringify(this.partialMessage) : null, model shouldnt see partials
                this.suffixMessagesJson,
            ].filter(Boolean).join(",") +
            "]";
    }
}
