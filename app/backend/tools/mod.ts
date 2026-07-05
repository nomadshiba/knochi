import { agents } from "~/backend/agents/mod.ts";
import { Tool } from "~/backend/tools/Tool.ts";

export const tools: readonly Tool[] = agents.flatMap((agent) => agent.tools);
export const toolsByName: ReadonlyMap<string, Tool> = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
