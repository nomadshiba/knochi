import { Str, StructCodec } from "@nomadshiba/codec";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export const ModelOutput = new StructCodec({
    id: Str,
    name: Str,
    created: Timestamp,
    providerId: UUID,
});
