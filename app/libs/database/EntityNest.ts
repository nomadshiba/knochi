import { StructField, StructFieldGeneric } from "~/libs/database/fields/StructField.ts";
import { IntegerField } from "~/libs/database/fields/IntegerField.ts";
import { WeakRefMap } from "~/libs/WeakRefMap.ts";
import { create } from "node:domain";

export type ComponentOptions<T extends StructFieldGeneric> = {
    name: string;
    struct: T;
};

const componentByName = new WeakRefMap<string, StructFieldGeneric>();
const componentNames = new WeakMap<StructFieldGeneric, string>();

export function defineComponent<T extends StructFieldGeneric>(options: ComponentOptions<T>): void {
    if (componentByName.has(options.name)) {
        throw new Error(`Component "${options.name}" is already defined.`);
    }
    if (componentNames.has(options.struct)) {
        const existingName = componentNames.get(options.struct);
        throw new Error(`This struct is already registered as component "${existingName}".`);
    }
    componentByName.set(options.name, options.struct);
    componentNames.set(options.struct, options.name);
}

const Vector3 = StructField({
    x: IntegerField(),
    y: IntegerField(),
    z: IntegerField(),
});

const Position = StructField({
    value: Vector3,
});

defineComponent({ name: "position", struct: Position });
