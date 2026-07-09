import { ArrayCodec, Bool, Codec, EnumCodec, NullableCodec, Str, StructCodec } from "@nomadshiba/codec";

export type MessageContentUser = Codec.InferOutput<typeof MessageContentUser>;
export const MessageContentUser = new StructCodec({
    content: Str,
});

export type MessageContentSystem = Codec.InferOutput<typeof MessageContentSystem>;
export const MessageContentSystem = new StructCodec({
    content: Str,
});

export type ToolCallResult = Codec.InferOutput<typeof ToolCallResult>;
export const ToolCallResult = new StructCodec({
    content: Str,
    display: Str,
});

export type ToolCall = Codec.InferOutput<typeof ToolCall>;
export const ToolCall = new EnumCodec({
    function: new StructCodec({
        id: Str,
        name: Str,
        arguments: Str,
        display: new StructCodec({
            summary: Str,
            content: Str,
        }),
        result: new NullableCodec(ToolCallResult),
    }),
});

export type MessageContentAssistant = Codec.InferOutput<typeof MessageContentAssistant>;
export const MessageContentAssistant = new StructCodec({
    partial: Bool,
    content: Str,
    refusal: Str,
    tool_calls: new ArrayCodec(ToolCall),
});

export type MessageContent = Codec.InferOutput<typeof MessageContent>;
export const MessageContent = new EnumCodec({
    user: MessageContentUser,
    system: MessageContentSystem,
    assistant: MessageContentAssistant,
});
