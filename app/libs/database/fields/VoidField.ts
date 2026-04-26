import { Field } from "~/libs/database/Field.ts";

export type VoidField = Field<void>;
export function VoidField(): VoidField {
    return {
        columns: () => [],
        toRow: () => ({}),
        fromRow: () => void 0,
    };
}
