import { Field } from "~/libs/database/Field.ts";

export type StrField = Field<string>;
export function StrField(): StrField {
    return {
        columns(name) {
            return [{ name, type: "text" }];
        },
        toRow(name, value) {
            return { [name]: value };
        },
        fromRow(name, row) {
            return String(row[name]);
        },
    };
}
