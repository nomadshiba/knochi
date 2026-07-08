import { v7 } from "@std/uuid";
import { agents, agentsByName } from "~/backend/agents/mod.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ProviderToolCall, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";
import { Tool } from "~/backend/tools/Tool.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";

const CODE_BLOCK = "```";

/**
 * Launches a subagent: a fresh chat (its own isolated context/history) running one of the
 * `subagent`/`all`-kind agents, seeded with a task prompt and run to completion, returning its
 * final answer as this tool's result. The subagent's chat is linked back to this tool call via
 * `chat.root_tool_call_id`, so it doesn't show up in the top-level chat list (`root_tool_call_id is null`)
 * but stays discoverable/inspectable as a child of the call that spawned it.
 */
export class TaskTool extends Tool {
    private availableAgents() {
        return agents.filter((agent) => agent.kind === "subagent" || agent.kind === "all");
    }

    public get definition(): ProviderToolDefinition {
        const available = this.availableAgents();
        return {
            type: "function",
            function: {
                name: "task",
                description: [
                    "Launch a subagent to autonomously handle a task in its own fresh chat/context, then return its final answer.",
                    "Use this to delegate self-contained multi-step work (research, exploration, a bounded chunk of implementation) so it doesn't clutter your own context, and/or to run independent subtasks.",
                    "Once launched, the subagent runs to completion on its own (you can't interject) — write `prompt` as a complete, self-contained brief: exactly what it should do, what it should return in its final message, and how to verify its work if applicable.",
                    "The subagent does not share your conversation — inline any context/files/values it needs directly in `prompt`.",
                    available.length
                        ? "Available `subagent_type` values:\n" + available.map((a) => `- ${a.name}: ${a.description}`).join("\n")
                        : 'No subagent types are currently registered — this tool cannot be used until an agent with kind "subagent" or "all" exists.',
                ].join("\n\n"),
                parameters: {
                    type: "object",
                    properties: {
                        description: {
                            type: "string",
                            description: "A short (3-5 word) description of the task, used as the subagent chat's name.",
                        },
                        prompt: {
                            type: "string",
                            description:
                                "The complete, self-contained task for the subagent to perform autonomously, including what it should return in its final message.",
                        },
                        subagent_type: {
                            type: "string",
                            enum: available.map((a) => a.name),
                            description: "Which agent type to run as the subagent. See the list of available types above.",
                        },
                    },
                    required: ["description", "prompt", "subagent_type"],
                },
            },
        };
    }

    public async execute(chat: ChatClient, call: ToolCall): Promise<string> {
        let args: { description?: string; prompt?: string; subagent_type?: string };
        try {
            args = JSON.parse(call.value.arguments);
        } catch {
            return "Error: invalid JSON arguments";
        }

        if (!args.prompt) return "Error: missing 'prompt' argument";
        if (!args.subagent_type) return "Error: missing 'subagent_type' argument";

        const subagent = agentsByName.get(args.subagent_type);
        if (!subagent) {
            return `Error: unknown subagent_type "${args.subagent_type}"`;
        }
        if (subagent.kind === "primary") {
            return `Error: agent "${subagent.name}" has kind "primary" and can't be used as a subagent`;
        }

        if (!chat.model) {
            return "Error: this chat has no model configured, can't run a subagent";
        }

        let subChat: ChatClient;
        try {
            subChat = await ChatClient.create(args.description || args.subagent_type, {
                agent: subagent,
                providerId: chat.model.provider.id,
                model: chat.model.name,
                callId: call.value.id,
            });
        } catch (reason) {
            return `Error creating subagent chat: ${String(reason)}`;
        }

        try {
            await subChat.pushProviderMessage(v7.generate(), { role: "user", content: args.prompt }, { wait: true });
        } catch (reason) {
            return `Error running subagent: ${String(reason)}`;
        }

        let finalMessage: string | undefined;
        const iter = subChat.messages.iter();
        while (true) {
            const { value: message, done } = iter.next();
            if (done) break;
            if (message.content.kind === "assistant") finalMessage = message.content.value.content ?? finalMessage;
        }

        return finalMessage ?? "(subagent finished without a final message)";
    }

    override renderCallSummary(call: ProviderToolCall): string {
        const args = call.function.arguments;
        let parsed: { description?: string; subagent_type?: string };
        try {
            parsed = JSON.parse(args);
        } catch {
            return "**task**";
        }
        return parsed.subagent_type
            ? `**${parsed.description ?? "task"}** (\`${parsed.subagent_type}\`)`
            : `**${parsed.description ?? "task"}**`;
    }

    override renderCallContent(call: ProviderToolCall): string {
        const args = call.function.arguments;
        let parsed: { description?: string; prompt?: string; subagent_type?: string };
        try {
            parsed = JSON.parse(args);
        } catch {
            return `~~task~~(${args})`;
        }
        if (!parsed.prompt || !parsed.subagent_type) return `~~task~~(${args})`;
        return `**${parsed.description ?? "task"}** (\`${parsed.subagent_type}\`)\n\n${CODE_BLOCK}\n${parsed.prompt}\n${CODE_BLOCK}`;
    }

    override renderResult(content: string): string {
        return content;
    }
}
