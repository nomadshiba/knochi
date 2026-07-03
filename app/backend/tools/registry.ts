import { agents } from "~/backend/agents/mod.ts";
import { Tool } from "~/backend/tools/Tool.ts";

const toolMap = new Map<string, Tool>();
for (const agent of agents) {
    for (const tool of agent.tools) {
        const name = tool.definition().function.name;
        if (!toolMap.has(name)) toolMap.set(name, tool);
    }
}

export function renderToolCall(name: string, args: string): string {
    const tool = toolMap.get(name);
    if (tool) return tool.renderCall(name, args);
    return `### ${name}\n\n\`\`\`\n${args}\n\`\`\``;
}

export function renderToolResult(name: string, args: string, result: string): string {
    const tool = toolMap.get(name);
    if (tool) return tool.renderResult(name, args, result);
    return `### ${name} result\n\n\`\`\`\n${result}\n\`\`\``;
}

export function getToolNameByCallId(history: { role: string; assistant?: { tool_calls: { id: string; function?: { name: string } | null }[] } | null }[], toolCallId: string): string | undefined {
    for (const msg of history) {
        if (msg.role === "assistant" && msg.assistant) {
            const tc = msg.assistant.tool_calls.find((t) => t.id === toolCallId);
            if (tc?.function?.name) return tc.function.name;
        }
    }
    return undefined;
}