import { v7 } from "@std/uuid";
import { agentsByName, agentsWhereKindSubagent } from "~/backend/agents/mod.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { ProviderToolCall, ProviderToolDefinition } from "~/backend/providers/ProviderClient.ts";
import { Tool } from "~/backend/tools/Tool.ts";

const CODE_BLOCK = "```";

export class TaskTool extends Tool {
    public get definition(): ProviderToolDefinition {
        return {
            type: "function",
            function: {
                name: "task",
                description: [
                    "Launch a subagent to autonomously handle a task in its own fresh context, then return only its final answer to you.",
                    "The point is context economy: the subagent spends its own tokens on all the intermediate work — searches, dead ends, tool output, long files — and you get back just the distilled result, not the mess it waded through. Reach for this on anything long-running, noisy, or token-heavy that you don't need to watch happen: research, codebase exploration, a bounded chunk of implementation, digesting a large document.",
                    "You can launch several at once for independent subtasks and let them run in parallel.",
                    "Once launched, a subagent runs to completion on its own — you can't interject, correct, or answer its questions. So `prompt` must be a complete, self-contained brief: exactly what to do, what to return in the final message, and how to verify the work where that applies. It does not share your conversation or see your files — inline every value, path, and piece of context it needs.",
                    "A subagent is a fresh worker, not a colleague who remembers the last one. Nothing carries between launches; give each the full picture.",
                    agentsWhereKindSubagent.length
                        ? "Available `subagent_type` values:\n" +
                            agentsWhereKindSubagent.map((a) => `- ${a.name}: ${a.description}`).join("\n")
                        : 'No subagent types are registered — this tool cannot be used until an agent with kind "subagent" or "all" exists.',
                ].join("\n\n"),
                parameters: {
                    type: "object",
                    properties: {
                        description: {
                            type: "string",
                            description: "A short (3-5 word) label for the task, used as the subagent chat's name.",
                        },
                        prompt: {
                            type: "string",
                            description:
                                "The complete, self-contained brief the subagent runs autonomously: what to do, what to return in its final message, and any context/files/values it needs (it sees nothing from your conversation).",
                        },
                        subagent_type: {
                            type: "string",
                            enum: agentsWhereKindSubagent.map((a) => a.name),
                            description: "Which agent type to run. See the list of available types above.",
                        },
                    },
                    required: ["description", "prompt", "subagent_type"],
                },
            },
        };
    }

    public async execute(chat: ChatClient, call: ToolCall, signal: AbortSignal): Promise<string> {
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

        const onAbort = () => subChat.abortAgent();
        if (signal.aborted) {
            subChat.abortAgent();
            return "Error: aborted";
        }
        signal.addEventListener("abort", onAbort, { once: true });

        try {
            await subChat.pushMessage({
                id: v7.generate(),
                content: {
                    kind: "user",
                    value: { content: args.prompt },
                },
                created: new Date(),
            });
            await subChat.startAgent();
        } catch (reason) {
            return `Error running subagent: ${String(reason)}`;
        } finally {
            signal.removeEventListener("abort", onAbort);
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
