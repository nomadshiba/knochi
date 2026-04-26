import { ColumnDataType } from "@kysely/kysely";

export type Column = {
    name: string;
    type: ColumnDataType;
};

// deno-lint-ignore no-explicit-any
export type FieldGeneric = Field<any>;
export type Field<T> = {
    columns(name: string): Column[];
    toRow(name: string, value: T): Record<string, unknown>;
    fromRow(name: string, row: Record<string, unknown>): T;
};
export type FieldValue<T extends FieldGeneric> = T extends Field<infer U> ? U : never;
