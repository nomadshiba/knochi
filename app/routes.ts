import { ArrayCodec, Void } from "@nomadshiba/codec";
import { Schema } from "./libs/Router.ts";
import { ModelOutput } from "./handlers/models/ModelOutput.ts";
import { AgentOutput } from "./handlers/agents/AgentOutput.ts";
import { ProviderOutput } from "./handlers/providers/ProviderOutput.ts";

export type RoutesSchema = typeof RoutesSchema;
export const RoutesSchema = {
    "GET /v1/models": { input: Void, output: new ArrayCodec(ModelOutput) },
    "GET /v1/models/:modelName": { input: Void, output: ModelOutput },

    "POST /v1/agents": { input: Void, output: Void },
    "GET /v1/agents": { input: Void, output: new ArrayCodec(AgentOutput) },
    "GET /v1/agents/:agentId": { input: Void, output: AgentOutput },
    "DELETE /v1/agents/:agentId": { input: Void, output: ProviderOutput },

    "POST /v1/providers": { input: Void, output: Void },
    "GET /v1/providers": { input: Void, output: new ArrayCodec(ProviderOutput) },
    "GET /v1/providers/:providerId": { input: Void, output: ProviderOutput },
    "DELETE /v1/providers/:providerId": { input: Void, output: ProviderOutput },
} as const satisfies Schema;
