import { Codec } from "@nomadshiba/codec";
import { RouterClient } from "~/libs/routing/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ProviderAssistantMessageStream } from "~/backend/providers/ProviderClient.ts";

export type MessageOutput = Codec.InferOutput<typeof ChatMessageOutput>;
export type ToolCallOutput = (MessageOutput["content"] & { kind: "assistant" })["value"]["tool_calls"][number];
export type ChatStreamEvent =
    | { type: "message"; data: Codec.InferOutput<typeof ChatMessageOutput> }
    | { type: "stream"; data: ProviderAssistantMessageStream };

export const api = RouterClient.create<RoutesSchema>({
    baseUrl: new URL("/", location.origin),
    schema: RoutesSchema,
    fetch: fetch.bind(window),
});
