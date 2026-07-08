import { Codec, EnumCodec, ModelCodec, NullableCodec, Str, StructCodec, VarInt } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";
import { ToolCallResult } from "~/backend/handlers/chats/messages/MessageContent.ts";

export type ChatAssistantMessageDelta = Codec.InferOutput<typeof ChatAssistantMessageDelta>;
export const ChatAssistantMessageDelta = new StructCodec({
    id: UUID,
    delta: new EnumCodec({
        text: Str,
        refusal: Str,
        tool_call: new ModelCodec({
            index: VarInt,
            "id?": Str,
            "name?": Str,
            "arguments?": Str,
            "display?": new ModelCodec({
                "summary?": Str,
                "content?": Str,
            }),
            "result?": ToolCallResult,
        }),
        done: new EnumCodec({
            provider: new NullableCodec(Str),
            fail: Str,
        }),
    }),
});
