import { Str, StructCodec, UnionCodec, Void } from "@nomadshiba/codec";

export const AgentInput = new StructCodec({
    name: Str,
    template: new UnionCodec({
        default: Void,
    }),
});
