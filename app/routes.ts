import { ArrayCodec, Void } from "@nomadshiba/codec";
import { AgentOutput } from "~/backend/handlers/agents/AgentOutput.ts";
import { ChatInput } from "~/backend/handlers/chats/ChatInput.ts";
import { ChatOutput } from "~/backend/handlers/chats/ChatOutput.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { MessageContentUser } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { ModelOutput } from "~/backend/handlers/models/ModelOutput.ts";
import { SettingsInput } from "~/backend/handlers/settings/SettingsInput.ts";
import { SettingsOutput } from "~/backend/handlers/settings/SettingsOutput.ts";
import { Schema } from "~/libs/Router.ts";
import { ProviderInput } from "~/backend/handlers/providers/ProviderInput.ts";
import { ProviderOutput } from "~/backend/handlers/providers/ProviderOutput.ts";

export type RoutesSchema = typeof RoutesSchema;
export const RoutesSchema = {
    "GET /v1/models?provider=:provider": { input: Void, output: new ArrayCodec(ModelOutput) },
    "GET /v1/models": { input: Void, output: new ArrayCodec(ModelOutput) },
    "GET /v1/models/:modelName?provider=:provider": { input: Void, output: ModelOutput },
    "GET /v1/models/:modelName": { input: Void, output: ModelOutput },

    "GET /v1/agents": { input: Void, output: new ArrayCodec(AgentOutput) },

    "POST /v1/providers": { input: ProviderInput, output: Void },
    "GET /v1/providers": { input: Void, output: new ArrayCodec(ProviderOutput) },
    "GET /v1/providers/:providerId": { input: Void, output: ProviderOutput },
    "PATCH /v1/providers/:providerId": { input: ProviderInput.partial(), output: Void },
    "DELETE /v1/providers/:providerId": { input: Void, output: Void },

    "GET /v1/settings": { input: Void, output: SettingsOutput },
    "PATCH /v1/settings": { input: SettingsInput, output: Void },

    "POST /v1/chats": { input: ChatInput, output: Void },
    "GET /v1/chats": { input: Void, output: new ArrayCodec(ChatOutput) },
    "GET /v1/chats/:chatId": { input: Void, output: ChatOutput },
    "PATCH /v1/chats/:chatId": { input: ChatInput.partial(), output: Void },
    "DELETE /v1/chats/:chatId": { input: Void, output: Void },

    "POST /v1/chats/:chatId/messages": { input: MessageContentUser, output: Void },
    "GET /v1/chats/:chatId/messages": { input: Void, output: new ArrayCodec(ChatMessageOutput) },
    "GET /v1/chats/:chatId/messages/:messageId": { input: Void, output: ChatMessageOutput },
    "DELETE /v1/chats/:chatId/messages/:messageId": { input: Void, output: Void },
} as const satisfies Schema;
