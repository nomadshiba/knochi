import { Str, StructCodec } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";

export const ChatOutput = new StructCodec({
    id: UUID,
    name: Str,
    "root_message_id?": UUID,
    created: Timestamp,
    updated: Timestamp,
});
