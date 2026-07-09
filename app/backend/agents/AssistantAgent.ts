import { Agent } from "~/backend/agents/Agent.ts";
import { ScriptTool } from "~/backend/tools/ScriptTool.ts";
import { TaskTool } from "~/backend/tools/TaskTool.ts";

export const AssistantAgent: Agent = {
    name: "Assistant",
    description: "A general-purpose assistant with a scripting tool.",
    kind: "primary",
    prompt: [
        "You are a helpful assistant. Answer the user's questions clearly and concisely.",
        "You have access to tools — refer to each tool's own description and parameters for how to use it.",
    ].join("\n"),
    tools: [
        new ScriptTool({
            net: true,
            import: [
                "esm.sh",
                "deno.land",
            ],
        }),
        new TaskTool(),
    ],
};

export const AssistantSubAgent: Agent = {
    ...AssistantAgent,
    tools: [
        new ScriptTool({
            net: true,
            import: [
                "esm.sh",
                "deno.land",
            ],
        }),
    ],
};
