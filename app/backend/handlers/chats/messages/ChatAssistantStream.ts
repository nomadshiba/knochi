import { Codec, EnumCodec, NullableCodec, Str, StructCodec, U8 } from "@nomadshiba/codec";
import { ToolCallResult } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export type ChatAssistantDelta = Codec.InferOutput<typeof ChatAssistantDelta>;
export const ChatAssistantDelta = new EnumCodec({
    text: Str,
    refusal: Str,
    tool_call_new: new StructCodec({
        index: U8,
        id: UUID,
    }),
    tool_call_delta: new StructCodec({
        index: U8,
        name: Str,
        arguments: Str,
        display: new NullableCodec(new StructCodec({ summary: Str })),
    }),
    tool_call_done: new StructCodec({
        index: U8,
        display: new StructCodec({ content: Str }),
    }),
    tool_call_result: new StructCodec({
        index: U8,
        result: ToolCallResult,
    }),
    done: new EnumCodec({
        provider: new NullableCodec(Str),
        fail: Str,
    }),
});

export type ChatAssistantStream = Codec.InferOutput<typeof ChatAssistantStream>;
export const ChatAssistantStream = new StructCodec({
    id: UUID,
    delta: ChatAssistantDelta,
});
