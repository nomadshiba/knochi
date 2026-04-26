import { Str, StructCodec, UnionCodec } from "@nomadshiba/codec";

export const MessageRoleUser = new StructCodec({
    content: Str,
});

export const MessageRoleSystem = new StructCodec({
    content: Str,
});

export const MessageRoleAssistant = new StructCodec({
    "content?": Str,
    "refusal?": Str,
});

export const MessageRoleTool = new StructCodec({
    content: Str,
    tool_call_id: Str,
});

export const MessageRole = new UnionCodec({
    user: MessageRoleUser,
    system: MessageRoleSystem,
    assistant: MessageRoleAssistant,
    tool: MessageRoleTool,
});
