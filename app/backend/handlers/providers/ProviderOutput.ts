import { Codec, Str, StructCodec } from "@nomadshiba/codec";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { Url } from "~/libs/codecs/URL.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export type Provider = Codec.InferOutput<typeof ProviderOutput>;
export const ProviderOutput = new StructCodec({
    id: UUID,
    name: Str,
    base: Url,
    created: Timestamp,
    updated: Timestamp,
});
