import { db } from "~/backend/database/client.ts";
import {
    ProviderAssistantMessage,
    ProviderChatMessage,
    ProviderSystemMessage,
    ProviderTool,
    ProviderToolCall,
    ProviderToolMessage,
    ProviderUserMessage,
} from "~/backend/providers/ProviderClient.ts";
import { ProviderClient } from "~/backend/providers/ProviderClient.ts";
import { Agent } from "~/backend/agents/Agent.ts";
import { Tool } from "~/backend/tools/Tool.ts";
import { chatBus } from "~/backend/agents/chatBus.ts";

export type LoadedMessage = {
    id: string;
    role: string;
    created: number;
    system?: { content: string } | null;
    user?: { content: string } | null;
    assistant?: {
        content: string | null;
        refusal: string | null;
        tool_calls: {
            id: string;
            type: string;
            function?: { name: string; arguments: string } | null;
        }[];
    } | null;
    tool?: { content: string; tool_call_id: string } | null;
};

export async function loadChatMessages(chatId: string): Promise<LoadedMessage[]> {
    const rows = await db.selectFrom("chat_message")
        .where("chat_message.chat_id", "=", chatId)
        .orderBy("chat_message.created", "asc")
        .select([
            "chat_message.id",
            "chat_message.role",
            "chat_message.created",
        ])
        .select((eb) => [
            eb.selectFrom("chat_message_role_system")
                .whereRef("chat_message_role_system.id", "=", "chat_message.id")
                .select("chat_message_role_system.content")
                .as("system_content"),
            eb.selectFrom("chat_message_role_user")
                .whereRef("chat_message_role_user.id", "=", "chat_message.id")
                .select("chat_message_role_user.content")
                .as("user_content"),
            eb.selectFrom("chat_message_role_assistant")
                .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                .select("chat_message_role_assistant.content")
                .as("assistant_content"),
            eb.selectFrom("chat_message_role_assistant")
                .whereRef("chat_message_role_assistant.id", "=", "chat_message.id")
                .select("chat_message_role_assistant.refusal")
                .as("assistant_refusal"),
            eb.selectFrom("chat_message_role_tool")
                .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                .select("chat_message_role_tool.content")
                .as("tool_content"),
            eb.selectFrom("chat_message_role_tool")
                .whereRef("chat_message_role_tool.id", "=", "chat_message.id")
                .select("chat_message_role_tool.tool_call_id")
                .as("tool_tool_call_id"),
        ])
        .execute();

    const result: LoadedMessage[] = [];
    for (const row of rows) {
        const msg: LoadedMessage = {
            id: row.id,
            role: row.role,
            created: row.created,
        };
        if (row.role === "system") {
            msg.system = { content: row.system_content! };
        } else if (row.role === "user") {
            msg.user = { content: row.user_content! };
        } else if (row.role === "assistant") {
            const toolCalls = await db.selectFrom("chat_message_role_assistant_toolcall")
                .where("chat_message_role_assistant_toolcall.chat_message_id", "=", row.id)
                .select([
                    "chat_message_role_assistant_toolcall.id",
                    "chat_message_role_assistant_toolcall.type",
                ])
                .execute();
            const calls: LoadedMessage["assistant"] extends infer A ? A extends { tool_calls: infer T } ? T : never
                : never = [];
            for (const tc of toolCalls) {
                const fn = await db.selectFrom("chat_message_role_assistant_toolcall_type_function")
                    .where("chat_message_role_assistant_toolcall_type_function.id", "=", tc.id)
                    .select([
                        "chat_message_role_assistant_toolcall_type_function.name",
                        "chat_message_role_assistant_toolcall_type_function.arguments",
                    ])
                    .executeTakeFirst();
                calls.push({
                    id: tc.id,
                    type: tc.type,
                    function: fn ? { name: fn.name, arguments: fn.arguments } : null,
                });
            }
            msg.assistant = {
                content: row.assistant_content,
                refusal: row.assistant_refusal,
                tool_calls: calls,
            };
        } else if (row.role === "tool") {
            msg.tool = { content: row.tool_content!, tool_call_id: row.tool_tool_call_id! };
        }
        result.push(msg);
    }
    return result;
}

function formatToolResultContent(toolCallId: string, content: string): string {
    return `[tool_call_id: ${toolCallId}]\n${content}`;
}

export function toProviderMessages(messages: LoadedMessage[]): ProviderChatMessage[] {
    const out: ProviderChatMessage[] = [];
    for (const m of messages) {
        if (m.role === "system" && m.system) {
            out.push({ role: "system", content: m.system.content } satisfies ProviderSystemMessage);
        } else if (m.role === "user" && m.user) {
            out.push({ role: "user", content: m.user.content } satisfies ProviderUserMessage);
        } else if (m.role === "assistant" && m.assistant) {
            const tool_calls: ProviderToolCall[] = m.assistant.tool_calls
                .filter((c) => c.type === "function" && c.function)
                .map((c) => ({
                    id: c.id,
                    type: "function" as const,
                    function: { name: c.function!.name, arguments: c.function!.arguments },
                }));
            out.push(
                {
                    role: "assistant",
                    content: m.assistant.content ?? null,
                    refusal: m.assistant.refusal ?? undefined,
                    tool_calls: tool_calls.length ? tool_calls : undefined,
                } satisfies ProviderAssistantMessage,
            );
        } else if (m.role === "tool" && m.tool) {
            out.push(
                { role: "tool", content: formatToolResultContent(m.tool.tool_call_id, m.tool.content), tool_call_id: m.tool.tool_call_id } satisfies
                    ProviderToolMessage,
            );
        }
    }
    return out;
}

export async function storeAssistantMessage(chatId: string, message: ProviderAssistantMessage): Promise<void> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.insertInto("chat_message")
        .values({ id, chat_id: chatId, role: "assistant", created: now })
        .execute();

    await db.insertInto("chat_message_role_assistant")
        .values({
            id,
            content: message.content ?? null,
            refusal: message.refusal ?? null,
        })
        .execute();

    for (const call of message.tool_calls ?? []) {
        await db.insertInto("chat_message_role_assistant_toolcall")
            .values({ id: call.id, chat_message_id: id, type: call.type })
            .execute();
        if (call.type === "function") {
            await db.insertInto("chat_message_role_assistant_toolcall_type_function")
                .values({ id: call.id, name: call.function.name, arguments: call.function.arguments })
                .execute();
        }
    }
}

export async function storeToolMessage(chatId: string, message: ProviderToolMessage): Promise<void> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.insertInto("chat_message")
        .values({ id, chat_id: chatId, role: "tool", created: now })
        .execute();

    await db.insertInto("chat_message_role_tool")
        .values({ id, content: message.content, tool_call_id: message.tool_call_id })
        .execute();
}

const MAX_TOOL_ROUNDS = 16;

export async function runAgent(params: {
    chatId: string;
    client: ProviderClient;
    model: string;
    agent: Agent;
}): Promise<void> {
    const { chatId, client, model, agent } = params;
    const tools = agent.tools;
    const history = await loadChatMessages(chatId);

    let messages: ProviderChatMessage[] = [
        { role: "system", content: await agent.prompt(history) },
        ...toProviderMessages(history),
    ];

    const toolDefs = tools.length
        ? tools.map((t): ProviderTool => {
            const d = t.definition();
            return { name: d.function.name, description: d.function.description, parameters: d.function.parameters };
        })
        : undefined;

    const toolMap = new Map(tools.map((t) => [t.definition().function.name, t] as const));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const assistantId = crypto.randomUUID();
        chatBus.emit(chatId, { kind: "assistant_start", value: { id: assistantId } });

        let textBuffer = "";
        let refusalBuffer = "";
        const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>();

        try {
            for await (const delta of client.chatStream({ model, messages, tools: toolDefs })) {
                if (delta.kind === "text") {
                    textBuffer += delta.value;
                    chatBus.emit(chatId, { kind: "assistant_text", value: { id: assistantId, delta: delta.value } });
                } else if (delta.kind === "refusal") {
                    refusalBuffer += delta.value;
                    chatBus.emit(chatId, { kind: "assistant_refusal", value: { id: assistantId, delta: delta.value } });
                } else if (delta.kind === "tool_call") {
                    const existing = toolCallBuffers.get(delta.value.index) ?? { id: delta.value.id ?? "", name: delta.value.name ?? "", arguments: "" };
                    if (delta.value.id) existing.id = delta.value.id;
                    if (delta.value.name) existing.name = delta.value.name;
                    if (delta.value.arguments) existing.arguments += delta.value.arguments;
                    toolCallBuffers.set(delta.value.index, existing);
                    const tool = toolMap.get(existing.name);
                    const display = tool ? tool.renderCall(existing.name, existing.arguments) : `${existing.name}(${existing.arguments})`;
                    chatBus.emit(chatId, {
                        kind: "assistant_tool_call_delta",
                        value: { id: assistantId, index: delta.value.index, tool_call_id: existing.id, name: existing.name, arguments: existing.arguments, display },
                    });
                }
            }
        } catch (error) {
            chatBus.emit(chatId, { kind: "error", value: { message: String(error) } });
            return;
        }

        const toolCalls: ProviderToolCall[] = [...toolCallBuffers.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, v]) => ({ id: v.id, type: "function" as const, function: { name: v.name, arguments: v.arguments } }));

        const reply: ProviderAssistantMessage = {
            role: "assistant",
            content: textBuffer || null,
            refusal: refusalBuffer || undefined,
            tool_calls: toolCalls.length ? toolCalls : undefined,
        };

        await storeAssistantMessage(chatId, reply);
        chatBus.emit(chatId, { kind: "assistant_done", value: { id: assistantId } });

        if (!toolCalls.length) break;

        messages = [...messages, reply];

        for (const call of toolCalls) {
            const tool = toolMap.get(call.function.name);
            const callDisplay = tool ? tool.renderCall(call.function.name, call.function.arguments) : `${call.function.name}(${call.function.arguments})`;
            chatBus.emit(chatId, {
                kind: "assistant_tool_call",
                value: { id: assistantId, tool_call_id: call.id, name: call.function.name, arguments: call.function.arguments },
            });
            chatBus.emit(chatId, { kind: "tool_start", value: { tool_call_id: call.id, name: call.function.name, arguments: call.function.arguments, display: callDisplay } });

            let result: ProviderToolMessage;
            if (tool) {
                try {
                    const currentHistory = await loadChatMessages(chatId);
                    result = await tool.execute(currentHistory, call);
                } catch (error) {
                    result = { role: "tool", content: `Error: ${String(error)}`, tool_call_id: call.id };
                }
            } else {
                result = { role: "tool", content: `Error: unknown tool "${call.function.name}"`, tool_call_id: call.id };
            }

            await storeToolMessage(chatId, result);
            const resultDisplay = tool ? tool.renderResult(call.function.name, call.function.arguments, result.content) : result.content;
            chatBus.emit(chatId, { kind: "tool_result", value: { tool_call_id: call.id, content: result.content, display: resultDisplay } });
            messages = [...messages, { ...result, content: formatToolResultContent(result.tool_call_id, result.content) }];
        }
    }
}
