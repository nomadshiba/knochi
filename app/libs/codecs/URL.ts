import { Codec, Str, type Stride } from "@nomadshiba/codec";

export class UrlCodec extends Codec<URL, string | URL> {
    public override readonly stride: Stride<"variable"> = { kind: "variable" };

    public override encoder(value: string | URL, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
    public override encoder(value: string | URL, target: Uint8Array, offset: number): number;
    public override encoder(value: string | URL, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
        const href = value instanceof URL ? value.href : new URL(value).href;
        if (target === undefined) return Str.encode(href);
        return Str.encodeInto(href, target, offset!);
    }

    public override decoder(data: Uint8Array, offset: number): [URL, number] {
        const [href, size] = Str.decode(data, offset);
        return [new URL(href), size];
    }
}

export const Url = new UrlCodec();
