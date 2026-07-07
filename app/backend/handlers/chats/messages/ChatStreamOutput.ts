import { EnumCodec, ModelCodec, NullableCodec, Str, StructCodec, VarInt } from "@nomadshiba/codec";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export const ChatStreamOutput = new EnumCodec({
    message: ChatMessageOutput,
    stream: new StructCodec({
        id: UUID,
        delta: new EnumCodec({
            text: Str,
            refusal: Str,
            tool_call: new ModelCodec({
                index: VarInt,
                "id?": Str,
                "name?": Str,
                "arguments?": Str,
                display: new StructCodec({ summary: Str }),
            }),
            done: new StructCodec({ finish_reason: new NullableCodec(Str) }),
        }),
    }),
});
