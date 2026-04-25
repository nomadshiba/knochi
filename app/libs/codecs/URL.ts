import { Codec, Str } from "@nomadshiba/codec";

export class UrlCodec extends Codec<URL, string | URL> {
    public override readonly stride = -1;

    public override encode(value: string | URL, target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
        if (value instanceof URL) {
            return Str.encode(value.href, target);
        }
        return Str.encode(new URL(value).href, target);
    }

    public override decode(data: Uint8Array): [URL, number] {
        const [href, offset] = Str.decode(data);
        return [new URL(href), offset];
    }
}

export const Url = new UrlCodec();
