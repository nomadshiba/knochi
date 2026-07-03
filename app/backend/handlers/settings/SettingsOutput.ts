import { Str, StructCodec } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";

export const SettingsOutput = new StructCodec({
    "last_provider_id?": UUID,
    "last_model_id?": Str,
    updated: Timestamp,
});