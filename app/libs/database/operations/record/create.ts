import { ShapeGeneric, StructFieldValue } from "~/libs/database/fields/StructField.ts";

export async function createRecord<TShape extends ShapeGeneric>(
    shape: TShape,
    value: StructFieldValue<TShape>,
): Promise<StructFieldValue<TShape>> {
}
