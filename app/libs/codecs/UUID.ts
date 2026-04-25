import { Str } from "@nomadshiba/codec";
import { validate } from "@std/uuid";

export const UUID = Str.transform((value) => {
    if (!validate(value)) {
        throw new Error("Invalid UUID format");
    }
    return value;
});
