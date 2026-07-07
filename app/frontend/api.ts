import { Codec } from "@nomadshiba/codec";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { RouterClient } from "~/libs/routing/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";
import { MessageContentAssistant, MessageContentTool } from "~/backend/handlers/chats/messages/MessageContent.ts";

export type ChatMessageResponse = Codec.InferOutput<typeof ChatMessageOutput>;
export type ChatAssistantMessageContent = Codec.InferOutput<typeof MessageContentAssistant>;
export type ChatAssistantMessage = ChatMessageResponse & { content: ChatAssistantMessageContent };
export type ChatToolMessageContent = Codec.InferOutput<typeof MessageContentTool>;
export type ChatToolMessage = ChatMessageResponse & { content: ChatToolMessageContent };
export type ChatStream = Codec.InferOutput<typeof ChatStreamOutput>;
export type ChatAssistantMessageStream = (ChatStream & { kind: "stream" })["value"];

export const api = RouterClient.create<RoutesSchema>({
    baseUrl: new URL("/", location.origin),
    schema: RoutesSchema,
    fetch: fetch.bind(window),
});
