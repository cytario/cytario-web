import {
  annotationNameOf,
  classNameOf,
  UNCLASSIFIED,
  type AnnotationClass,
} from "../../../state/store/annotations/annotations.store";
import { RGB } from "../../../state/store/types";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

export interface AnnotationGroupItem {
  feature: AnnotationFeature;
  index: number;
}

export interface AnnotationGroup {
  name: string;
  color: RGB | null;
  items: AnnotationGroupItem[];
}

interface GroupAnnotationsArgs {
  /** Authoring view: seed the Unclassified bucket and every defined class so
   *  empty classes show; read-only grants and searches skip that. */
  editable: boolean;
  classes: AnnotationClass[];
  searchQuery: string;
}

/** Group one set's features by classification name, in displayed order. The
 *  same grouping drives each set block's list and the section-wide selection
 *  axis, so a Shift-range walks exactly what the user sees. */
export const groupAnnotations = (
  features: AnnotationFeature[],
  { editable, classes, searchQuery }: GroupAnnotationsArgs,
): AnnotationGroup[] => {
  const query = searchQuery.trim().toLowerCase();
  const matches = (feature: AnnotationFeature) =>
    query.length === 0 || annotationNameOf(feature).toLowerCase().includes(query);

  const byName = new Map<string, AnnotationGroup>();
  if (editable && query.length === 0) {
    byName.set(UNCLASSIFIED, { name: UNCLASSIFIED, color: null, items: [] });
    for (const c of classes) byName.set(c.name, { name: c.name, color: c.color, items: [] });
  }
  features.forEach((feature, index) => {
    if (!matches(feature)) return;
    const name = classNameOf(feature);
    let group = byName.get(name);
    if (!group) {
      group = { name, color: feature.properties?.classification?.color ?? null, items: [] };
      byName.set(name, group);
    }
    group.items.push({ feature, index });
  });
  return [...byName.values()];
};

/** Flattened ids in displayed (grouped) order — the axis a Shift-range walks. */
export const orderedIdsOfGroups = (groups: AnnotationGroup[]): string[] =>
  groups.flatMap((group) => group.items.map((item) => item.feature.id).filter(Boolean)) as string[];
