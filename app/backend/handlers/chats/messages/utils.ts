import { Kysely, Transaction } from "kysely";
import { DB } from "~/backend/database/generated/types.ts";
import { ProviderToolCall, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";
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

export async function renderToolResult(result: ProviderToolMessage, tx: Transaction<DB> | Kysely<DB>): Promise<string> {
    const name = await toolNameFromCallId(result.tool_call_id, tx);
    const tool = toolsByName.get(name);
    if (tool) return tool.renderResult(result);
    return `### ${name} result\n\n\`\`\`\n${result.content}\n\`\`\``;
}

async function toolNameFromCallId(callId: string, tx: Transaction<DB> | Kysely<DB>): Promise<string> {
    const tool = await tx.selectFrom("chat_message_role_assistant_toolcall_type_function")
        .where("id", "=", callId)
        .select("name")
        .executeTakeFirst();
    if (!tool) {
        throw new Error("tool result without a call?");
    }

    return tool.name;
}
