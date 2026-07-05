import { ProviderToolCall, ProviderToolMessage } from "~/backend/providers/ProviderClient.ts";
import { toolsByName } from "~/backend/tools/mod.ts";
import { db } from "~/backend/database/client.ts";

export function renderToolCall(call: ProviderToolCall): string {
    const tool = toolsByName.get(call.function.name);
    if (tool) return tool.transformCall(call);
    return `### ${call.function.name}\n\n\`\`\`\n${call.function.arguments}\n\`\`\``;
}

export async function renderToolResult(result: ProviderToolMessage): Promise<string> {
    const name = await toolNameFromCallId(result.tool_call_id);
    const tool = toolsByName.get(name);
    if (tool) return tool.transformResult(result);
    return `### ${name} result\n\n\`\`\`\n${result.content}\n\`\`\``;
}

async function toolNameFromCallId(callId: string): Promise<string> {
    const tool = await db.selectFrom("chat_message_role_assistant_toolcall_type_function")
        .where("id", "=", callId)
        .select("name")
        .executeTakeFirst();
    if (!tool) {
        throw new Error("tool result without a call?");
    }

    return tool.name;
}
