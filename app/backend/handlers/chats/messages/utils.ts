import { ProviderToolCall } from "~/backend/providers/ProviderClient.ts";
import { toolsByName } from "~/backend/tools/mod.ts";

export function renderToolCallContent(call: ProviderToolCall): string {
    const tool = toolsByName.get(call.function.name);
    if (tool) return tool.renderCallContent(call);
    return `### ${call.function.name}\n\n\`\`\`\n${call.function.arguments}\n\`\`\``;
}

export function renderToolCallSummary(call: ProviderToolCall): string {
    const tool = toolsByName.get(call.function.name);
    if (tool) return tool.renderCallSummary(call);
    return `**${call.function.name}**`;
}

export function renderToolResult(name: string, content: string): string {
    const tool = toolsByName.get(name);
    if (tool) return tool.renderResult(content);
    return `\`\`\`\n${content}\n\`\`\``;
}
