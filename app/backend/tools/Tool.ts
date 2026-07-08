import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { ProviderToolCall, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";

export abstract class Tool {
    public abstract readonly definition: ProviderToolDefinition;
    public abstract execute(chat: ChatClient, call: ToolCall): Promise<string> | string;

    /** Render tool call as message content (markdown) **/
    public abstract renderCallSummary(call: ProviderToolCall): string;
    public abstract renderCallContent(call: ProviderToolCall): string;
    /** Render tool result as message content (markdown) **/
    public abstract renderResult(content: string): string;
}
