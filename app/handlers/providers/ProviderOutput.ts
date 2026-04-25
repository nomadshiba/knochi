import { Str, StructCodec, UnionCodec } from "@nomadshiba/codec";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { UUID } from "~/libs/codecs/UUID.ts";
import { Url } from "~/libs/codecs/URL.ts";

export const ProviderOutput = new StructCodec({
    id: UUID,
    name: Str,
    connection: new UnionCodec({
        oai: new StructCodec({
            base: Url,
            key: Str,
        }),
    }),
    created: Timestamp,
    updated: Timestamp,
});
