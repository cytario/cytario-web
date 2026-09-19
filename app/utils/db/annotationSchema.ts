import { z } from "zod";
import type { GeoJSONProperties } from "zod-geojson";
import {
  GeoJSONFeatureGenericSchema,
  GeoJSONMultiPolygonSchema,
  GeoJSONPointSchema,
  GeoJSONPolygonSchema,
  GeoJSONPositionSchema,
} from "zod-geojson";

const geometrySchema = z.discriminatedUnion("type", [
  GeoJSONPointSchema,
  GeoJSONPolygonSchema,
  GeoJSONMultiPolygonSchema,
]);

// `classification.color` feeds straight to deck.gl as an RGB triple. Accept
// >= 3 channels and coerce to RGB rather than reject the whole feature over
// color shape — legacy/imported sidecars may store RGBA.
const classificationSchema = z.object({
  name: z.string(),
  color: z
    .array(z.number())
    .min(3)
    .transform((c) => [c[0], c[1], c[2]] as [number, number, number]),
});

const propertiesSchema = z.looseObject({
  name: z.string().optional(),
  classification: classificationSchema.optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type AnnotationClassification = z.infer<typeof classificationSchema>;
export type AnnotationProperties = z.infer<typeof propertiesSchema>;

// zod-geojson makes `properties` nullable; normalize a missing/null value to an
// object so it matches the GeoJSON shape deck.gl's layer types expect.
const normalizedPropertiesSchema = propertiesSchema
  .nullish()
  .transform((p) => p ?? {}) as unknown as z.ZodType<GeoJSONProperties>;

const baseFeatureSchema = GeoJSONFeatureGenericSchema(
  GeoJSONPositionSchema,
  normalizedPropertiesSchema,
  geometrySchema,
);

// Identity is the standard top-level GeoJSON `feature.id`; we narrow the
// RFC's optional `string | number` to a required non-empty string (the
// selection key). Missing → dropped, no synthetic fallback.
const featureSchema = baseFeatureSchema.refine(
  (f): f is typeof f & { id: string } => {
    const id = (f as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0;
  },
  { message: "feature.id must be a non-empty string" },
);

// The generic's inferred output omits the base `id` and widens `properties` to
// a JSON record, so the type is derived explicitly.
export type AnnotationFeature = Omit<z.infer<typeof baseFeatureSchema>, "properties" | "id"> & {
  properties: AnnotationProperties;
  id: string;
};

/**
 * Validate a raw feature array: drop anything that fails the schema, keep the
 * survivors. Per-feature drop, not throw — one bad feature can't nuke the
 * whole collection.
 */
export function validAnnotationFeatures(raw: unknown): AnnotationFeature[] {
  if (!Array.isArray(raw)) return [];
  const out: AnnotationFeature[] = [];
  for (const item of raw) {
    const parsed = featureSchema.safeParse(item);
    if (!parsed.success) {
      console.warn("[annotations] dropped invalid feature:", parsed.error.issues);
      continue;
    }
    out.push(parsed.data as AnnotationFeature);
  }
  return out;
}
