import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ProviderToolCall, ProviderToolDefinition, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";

export abstract class Tool {
    public abstract readonly definition: ProviderToolDefinition;
    public abstract execute(chat: ChatClient, call: ProviderToolCall): Promise<ProviderToolMessage> | ProviderToolMessage;

    /** Render tool call as message content (markdown) **/
    public abstract transformCall(call: ProviderToolCall): string;
    /** Render tool result as message content (markdown) **/
    public abstract transformResult(result: ProviderToolMessage): string;
}
