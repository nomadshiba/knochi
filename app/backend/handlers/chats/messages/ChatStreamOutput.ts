import { EnumCodec, ModelCodec, NullableCodec, Str, StructCodec, VarInt } from "@nomadshiba/codec";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export const ChatStreamOutput = new EnumCodec({
    message: ChatMessageOutput,
    stream: new StructCodec({
        // Id of the (not-yet-persisted) message this delta belongs to. Matches the `id` of the
        // eventual `message` event, so the frontend can key a live-updating placeholder on it and
        // then replace it once the real message arrives — same replace-or-append-by-id idiom.
        id: UUID,
        delta: new EnumCodec({
            text: Str,
            refusal: Str,
            tool_call: new ModelCodec({ index: VarInt, "id?": Str, "name?": Str, "arguments?": Str }),
            done: new StructCodec({ finish_reason: new NullableCodec(Str) }),
        }),
    }),
});
