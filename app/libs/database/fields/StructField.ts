import { Column, Field, FieldGeneric, FieldValue } from "~/libs/database/Field.ts";

type WithoutQuestion<K extends string> = K extends `${infer Base}?` ? Base : K;
type IsOptional<K extends string> = K extends `${string}?` ? true : false;

export type ShapeGeneric = Record<string, FieldGeneric>;
export type StructFieldValue<T extends ShapeGeneric> =
    & {
        [K in keyof T as IsOptional<K & string> extends true ? WithoutQuestion<K & string> : never]+?: FieldValue<T[K]>;
    }
    & {
        [K in keyof T as IsOptional<K & string> extends true ? never : WithoutQuestion<K & string>]: FieldValue<T[K]>;
    };

export type StructField<TShape extends ShapeGeneric> = Field<StructFieldValue<TShape>> & { shape: TShape };
export function StructField<TShape extends ShapeGeneric>(shape: TShape): StructField<TShape> {
    const map = new Map(Object.entries(shape));

    return {
        shape,
        columns(name) {
            return map.entries().flatMap(([subname, subtype]): Column[] => {
                const cleanName = subname.endsWith("?") ? subname.slice(0, -1) : subname;
                return subtype.columns(`${name}.${cleanName}`);
            }).toArray();
        },
        toRow(name, value) {
            return Object.fromEntries(
                map.entries().flatMap(([subname, subtype]) => {
                    const isOptional = subname.endsWith("?");
                    const cleanName = isOptional ? subname.slice(0, -1) : subname;
                    const val = value[cleanName];
                    if (isOptional && val === undefined) return [];
                    return Object.entries(subtype.toRow(`${name}.${cleanName}`, val));
                }),
            );
        },
        fromRow(name, row) {
            return Object.fromEntries(
                map.entries().map(([subname, subtype]) => {
                    const isOptional = subname.endsWith("?");
                    const cleanName = isOptional ? subname.slice(0, -1) : subname;
                    const colName = `${name}.${cleanName}`;
                    if (isOptional && !(colName in row)) return [cleanName, undefined];
                    return [cleanName, subtype.fromRow(colName, row)];
                }),
            ) as never;
        },
    };
}
