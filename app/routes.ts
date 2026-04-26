import { ArrayCodec, Void } from "@nomadshiba/codec";
import { Schema } from "./libs/Router.ts";
import { ModelOutput } from "./handlers/models/ModelOutput.ts";
import { AgentInput } from "./handlers/agents/AgentInput.ts";
import { AgentOutput } from "./handlers/agents/AgentOutput.ts";
import { ProviderInput } from "./handlers/providers/ProviderInput.ts";
import { ProviderOutput } from "./handlers/providers/ProviderOutput.ts";
import { ChatInput } from "~/handlers/chats/ChatInput.ts";
import { ChatMessageInput } from "~/handlers/chats/messages/ChatMessageInput.ts";
import { ChatOutput } from "~/handlers/chats/ChatOutput.ts";
import { ChatMessageOutput } from "~/handlers/chats/messages/ChatMessageOutput.ts";

export type RoutesSchema = typeof RoutesSchema;
export const RoutesSchema = {
    "GET /v1/models": { input: Void, output: new ArrayCodec(ModelOutput) },
    "GET /v1/models/:modelName": { input: Void, output: ModelOutput },

    "POST /v1/agents": { input: AgentInput, output: Void },
    "GET /v1/agents": { input: Void, output: new ArrayCodec(AgentOutput) },
    "GET /v1/agents/:agentId": { input: Void, output: AgentOutput },
    "PATCH /v1/agents/:agentId": { input: AgentInput.partial(), output: Void },
    "DELETE /v1/agents/:agentId": { input: Void, output: Void },

    "POST /v1/providers": { input: ProviderInput, output: Void },
    "GET /v1/providers": { input: Void, output: new ArrayCodec(ProviderOutput) },
    "GET /v1/providers/:providerId": { input: Void, output: ProviderOutput },
    "PATCH /v1/providers/:providerId": { input: ProviderInput.partial(), output: Void },
    "DELETE /v1/providers/:providerId": { input: Void, output: Void },

    "POST /v1/chats": { input: ChatInput, output: Void },
    "GET /v1/chats": { input: Void, output: new ArrayCodec(ChatOutput) },
    "GET /v1/chats/:chatId": { input: Void, output: ChatOutput },
    "PATCH /v1/chats/:chatId": { input: ChatInput.partial(), output: Void },
    "DELETE /v1/chats/:chatId": { input: Void, output: Void },

    "POST /v1/chats/:chatId/messages": { input: ChatMessageInput, output: Void },
    "GET /v1/chats/:chatId/messages": { input: Void, output: new ArrayCodec(ChatMessageOutput) },
    "GET /v1/chats/:chatId/messages/:messageId": { input: Void, output: ChatMessageOutput },
    "DELETE /v1/chats/:chatId/messages/:messageId": { input: Void, output: Void },
} as const satisfies Schema;
