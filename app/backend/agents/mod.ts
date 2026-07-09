import { Agent } from "~/backend/agents/Agent.ts";
import { AssistantAgent, AssistantSubAgent } from "~/backend/agents/AssistantAgent.ts";

export const agents: readonly [Agent, ...Agent[]] = [AssistantAgent, AssistantSubAgent];
export const agentsByName: ReadonlyMap<string, Agent> = new Map(agents.map((agent) => [agent.name, agent]));
