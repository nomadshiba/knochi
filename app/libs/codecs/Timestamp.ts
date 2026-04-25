import { Codec, I64 } from "@nomadshiba/codec";

/**
 * Codec for JavaScript Date objects.
 * Encodes as I64 (8 bytes) - milliseconds since Unix epoch.
 */
export class TimestampCodec extends Codec<Date, Date | number> {
    readonly stride = I64.stride;

    encode(value: Date | number): Uint8Array<ArrayBuffer> {
        const ms = value instanceof Date ? value.getTime() : value;
        return I64.encode(BigInt(ms));
    }

    decode(data: Uint8Array<ArrayBuffer>): [Date, number] {
        const [ms, size] = I64.decode(data);
        return [new Date(Number(ms)), size];
    }
}

/** Singleton instance of TimestampCodec */
export const Timestamp = new TimestampCodec();
