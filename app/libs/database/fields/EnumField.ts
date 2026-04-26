import { Column, Field, FieldGeneric, FieldValue } from "~/libs/database/Field.ts";

export type VariantsGeneric = Record<string, FieldGeneric>;
export type EnumFieldValue<T extends VariantsGeneric> = {
    [K in keyof T]: { tag: K & string; value: FieldValue<T[K]> };
}[keyof T];

export type EnumField<T extends VariantsGeneric> = Field<EnumFieldValue<T>> & { variants: T };
export function EnumField<T extends VariantsGeneric>(variants: T): EnumField<T> {
    const map = new Map(Object.entries(variants));

    return {
        variants,
        columns(name) {
            return [
                { name, type: "text" },
                ...map.entries().flatMap(([tag, field]): Column[] => field.columns(`${name}.${tag}`)).toArray(),
            ];
        },
        toRow(name, value) {
            const { tag, value: inner } = value;
            const field = map.get(tag)!;
            return {
                [name]: tag,
                // null out all other variants' columns
                ...Object.fromEntries(
                    map.entries().flatMap(([t, f]) => f.columns(`${name}.${t}`).map((col) => [col.name, null])).toArray(),
                ),
                // overwrite with actual variant's values
                ...field.toRow(`${name}<${tag}>`, inner),
            };
        },
        fromRow(name, row) {
            const tag = String(row[name]);
            const field = map.get(tag)!;
            return {
                tag,
                value: field.fromRow(`${name}<${tag}>`, row),
            };
        },
    };
}
