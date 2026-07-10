import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ProviderChatMessage } from "~/backend/providers/ProviderClient.ts";

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
            throw new Error(`Can't have more than one partial message in the buffer.`);
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

    public done(id: string) {
        if (this.partialMessage?.id !== id) {
            throw new Error(`Done id:${id} doesnt match known partial message id:${this.partialMessage?.id}`);
        }
        if (this.partialMessage.content.value.partial) {
            throw new Error(`Partial message:${id} is still marked as partial`);
        }
        const message = this.partialMessage;
        this.partialMessage = null;
        this.push(message);
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
