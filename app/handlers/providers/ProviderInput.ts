import { Str, StructCodec, UnionCodec } from "@nomadshiba/codec";
import { Url } from "~/libs/codecs/URL.ts";

export const ProviderInput = new StructCodec({
    name: Str,
    connection: new UnionCodec({
        oai: new StructCodec({
            base: Url,
            key: Str,
        }),
    }),
});
