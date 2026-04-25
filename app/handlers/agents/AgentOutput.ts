import { Str, StructCodec, UnionCodec, Void } from "@nomadshiba/codec";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export const AgentOutput = new StructCodec({
    id: UUID,
    name: Str,
    template: new UnionCodec({
        default: Void,
    }),
    created: Timestamp,
    updated: Timestamp,
});
