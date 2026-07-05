import { Codec, type FixedCodec, I64, type Stride } from "@nomadshiba/codec";

/**
 * Codec for JavaScript Date objects.
 * Encodes as I64 (8 bytes) - milliseconds since Unix epoch.
 */
export class TimestampCodec extends Codec<Date, Date | number> implements FixedCodec<Date, Date | number> {
    readonly stride: Stride<"fixed"> = I64.stride;

    encoder(value: Date | number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
    encoder(value: Date | number, target: Uint8Array, offset: number): number;
    encoder(value: Date | number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
        const ms = value instanceof Date ? value.getTime() : value;
        if (target === undefined) return I64.encode(BigInt(ms));
        return I64.encodeInto(BigInt(ms), target, offset!);
    }

    decoder(data: Uint8Array, offset: number): [Date, number] {
        const [ms, size] = I64.decode(data, offset);
        return [new Date(Number(ms)), size];
    }
}

/** Singleton instance of TimestampCodec */
export const Timestamp = new TimestampCodec();
