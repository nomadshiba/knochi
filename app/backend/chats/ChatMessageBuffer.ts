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
    private messagesById: Map<string, ChatMessageOutput>;

    private prefixMessagesJson: string;
    private messagesJson: string;
    private suffixMessagesJson: string;

    private constructor(inital: ChatMessageOutput[]) {
        this.messages = inital;
        this.messagesById = new Map();

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

    public add(message: ChatMessageOutput): void {
        if (this.messagesById.has(message.id)) throw new Error("Can't add to buffer twice");
        this.messagesById.set(message.id, message);
        this.messages.push(message);
        if (this.messagesJson) this.messagesJson += ",";
        this.messagesJson += JSON.stringify(toProviderChatMessage(message)).slice(1, -1);
    }

    public getById(id: string): ChatMessageOutput | undefined {
        return this.messagesById.get(id);
    }

    public iter(): ArrayIterator<ChatMessageOutput> {
        return this.messages.values();
    }

    public toJSON(): string {
        return "[" +
            [this.prefixMessagesJson, this.messagesJson, this.suffixMessagesJson].filter(Boolean).join(",") +
            "]";
    }
}
