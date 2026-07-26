import type { z } from "zod";

/**
 * Minimal Zod-object -> JSON-Schema converter, just enough to build the
 * `requestedSchema` an elicitation request needs. Only handles the flat,
 * primitive-field shapes elicitation forms realistically use (string,
 * number, boolean, enum) — not a general-purpose JSON Schema generator.
 */
export function zodObjectToJsonSchema(schema: z.ZodObject<any>): {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
} {
  const shape = getShape(schema);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const { jsonSchema, optional } = describeField(fieldSchema as z.ZodTypeAny);
    properties[key] = jsonSchema;
    if (!optional) required.push(key);
  }

  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** Extracts the raw `{ [key]: ZodType }` shape from a `z.object(...)` schema, tolerant of zod v3/v4 internals. */
export function getShape(schema: z.ZodObject<any> | z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const shape = (schema as any).shape;
  return typeof shape === "function" ? shape() : (shape ?? {});
}

/** Reads a zod-version-agnostic type tag: works for both v3 (`_def.typeName`) and v4 (`_zod.def.type`) internals. */
function typeTag(schema: any): string | undefined {
  return schema?._def?.typeName ?? (schema?._zod?.def?.type ? `Zod${capitalize(schema._zod.def.type)}` : undefined);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function describeField(fieldSchema: z.ZodTypeAny): { jsonSchema: Record<string, unknown>; optional: boolean } {
  let current: any = fieldSchema;
  let optional = false;
  let description: string | undefined = current?.description;

  // Unwrap optional/default/nullable wrappers to find the base type.
  while (current) {
    const tag = typeTag(current);
    if (tag !== "ZodOptional" && tag !== "ZodDefault" && tag !== "ZodNullable") break;
    optional = true;
    current = current._def?.innerType ?? current._zod?.def?.innerType;
    description ??= current?.description;
  }

  const tag = typeTag(current);
  const base: Record<string, unknown> = { ...(description ? { description } : {}) };

  switch (tag) {
    case "ZodNumber":
      return { jsonSchema: { type: "number", ...base }, optional };
    case "ZodBoolean":
      return { jsonSchema: { type: "boolean", ...base }, optional };
    case "ZodEnum": {
      const raw = current._def?.values ?? current._def?.entries ?? current._zod?.def?.entries ?? {};
      const values = Array.isArray(raw) ? raw : Object.values(raw);
      return { jsonSchema: { type: "string", enum: values, ...base }, optional };
    }
    case "ZodString":
    default:
      return { jsonSchema: { type: "string", ...base }, optional };
  }
}
