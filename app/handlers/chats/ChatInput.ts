import { Str, StructCodec } from "@nomadshiba/codec";

export const ChatInput = new StructCodec({
    name: Str,
});
