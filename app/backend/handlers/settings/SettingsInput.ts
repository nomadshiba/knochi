import { NullableCodec, OptionalCodec, Str, StructCodec } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";

export const SettingsInput = new StructCodec({
    "last_provider_id?": new OptionalCodec(new NullableCodec(UUID)),
    "last_model_id?": new OptionalCodec(new NullableCodec(Str)),
});

export type SettingsInput = {
    last_provider_id?: string | null;
    last_model_id?: string | null;
};
