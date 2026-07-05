import { ArrayCodec, EnumCodec, ModelCodec, Str, StructCodec } from "@nomadshiba/codec";

export const MessageContentUser = new StructCodec({
    content: Str,
});

export const MessageContentSystem = new StructCodec({
    content: Str,
});

export const ToolCall = new EnumCodec({
    function: new StructCodec({ id: Str, name: Str, arguments: Str, display: Str }),
});

export const MessageContentAssistant = new ModelCodec({
    "content?": Str,
    "refusal?": Str,
    tool_calls: new ArrayCodec(ToolCall),
});

export const MessageContentTool = new StructCodec({
    content: Str,
    tool_call_id: Str,
    display: Str,
});

export const MessageContent = new EnumCodec({
    user: MessageContentUser,
    system: MessageContentSystem,
    assistant: MessageContentAssistant,
    tool: MessageContentTool,
});
