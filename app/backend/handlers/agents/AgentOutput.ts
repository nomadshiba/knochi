import { Codec, EnumCodec, Str, StructCodec, Void } from "@nomadshiba/codec";

export type AgentOutput = Codec.InferOutput<typeof AgentOutput>;
export const AgentOutput = new StructCodec({
    name: Str,
    description: Str,
    kind: new EnumCodec({
        primary: Void,
        subagent: Void,
        all: Void,
    }),
});
