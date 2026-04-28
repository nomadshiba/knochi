import { ArrayCodec, Str, StructCodec, UnionCodec } from "@nomadshiba/codec";

export const MessageContentUser = new StructCodec({
    content: Str,
});

export const MessageContentSystem = new StructCodec({
    content: Str,
});

export const ToolCall = new UnionCodec({
    function: new StructCodec({ name: Str, arguments: Str }),
});

export const MessageContentAssistant = new StructCodec({
    "content?": Str,
    "refusal?": Str,
    tool_calls: new ArrayCodec(ToolCall),
});

export const MessageContentTool = new StructCodec({
    content: Str,
    tool_call_id: Str,
});

export const MessageContent = new UnionCodec({
    user: MessageContentUser,
    system: MessageContentSystem,
    assistant: MessageContentAssistant,
    tool: MessageContentTool,
});
