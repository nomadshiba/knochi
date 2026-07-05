import { ModelCodec, Str, StructCodec } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";

export const ChatOutput = new ModelCodec({
    id: UUID,
    name: Str,
    "root_message_id?": UUID,
    agent: Str,
    "model?": new StructCodec({
        name: Str,
        providerId: UUID,
    }),
    created: Timestamp,
    updated: Timestamp,
});