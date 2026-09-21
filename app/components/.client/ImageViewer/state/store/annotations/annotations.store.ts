import type { AnnotationMode, RGB, ViewerSlice, ViewerStore } from "../types";
import {
  type AnnotationClass,
  classNameOf,
  classColor,
  generateAnnotationName,
  generateSetName,
  isReservedClassName,
  pickClassColor,
  translateGeometry,
} from "./annotationHelpers";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

export {
  annotationNameOf,
  classNameOf,
  classColor,
  generateAnnotationName,
  generateSetName,
  isReservedClassName,
  pickClassColor,
  UNCLASSIFIED,
  UNCLASSIFIED_COLOR,
} from "./annotationHelpers";
export type { AnnotationClass } from "./annotationHelpers";

/** Per-set view state — ephemeral, never persisted (lives apart from the
 *  S3-backed `annotationSets` so a view change can't trigger a sidecar write). */
export interface SetAnnotationView {
  /** Classification names hidden for THIS set. */
  hiddenClasses: string[];
}

/** Stable empty references so selectors never return a fresh value (zustand
 *  compares with `Object.is` — a new array each call loops renders). Read-only
 *  by convention; never mutated. */
const NO_FEATURES: AnnotationFeature[] = [];
const NO_HIDDEN: string[] = [];

/** Active set's features — the set that receives drawings. */
export const selectActiveSetFeatures = (state: ViewerStore): AnnotationFeature[] =>
  state.annotationSets.find((s) => s.id === state.activeSetId)?.features ?? NO_FEATURES;

/** A specific set's features by id. */
export const selectSetFeatures =
  (setId: string | undefined) =>
  (state: ViewerStore): AnnotationFeature[] =>
    setId
      ? (state.annotationSets.find((s) => s.id === setId)?.features ?? NO_FEATURES)
      : NO_FEATURES;

/** A specific set's hidden classification names (stable empty array by default). */
export const selectSetHiddenClasses =
  (setId: string | undefined) =>
  (state: ViewerStore): string[] =>
    (setId ? state.annotationView[setId]?.hiddenClasses : undefined) ?? NO_HIDDEN;

export interface AnnotationsSlice {
  /** All annotation sets — the single source of truth. Each set is one sidecar
   *  file on S3. The active set (`activeSetId`) is the own set that receives
   *  drawings; all others render read-only. */
  annotationSets: AnnotationSet[];
  /** The own set that receives drawings. `null` until the first own set is
   *  seeded or lazy-created on first draw. */
  activeSetId: string | null;
  annotationMode: AnnotationMode;
  /** `feature.id`s of selected features — stable across edits/reorders,
   *  unlike array indexes. Resolved to deck `selectedFeatureIndexes` at render. */
  annotationSelectedIds: string[];
  /** Per-set view state (hidden classes), keyed by `setId`. Kept apart from
   *  `annotationSets` so a view change never enters the persist diff. */
  annotationView: Record<string, SetAnnotationView>;
  /** Own-set class into which newly drawn regions are placed; `null` = draw
   *  unclassified. Resolved to `classification` only when a region commits.
   *  Browser-persisted per image (a "settings" sidecar is the eventual home). */
  annotationActiveClass: string | null;
  /** Own-set class registry — defined classes (name + color), including ones
   *  with zero members. Browser-persisted per image. Peers derive classes from
   *  their features and have no registry. */
  annotationClasses: AnnotationClass[];

  /** Merge sets from the one-time S3 read into the working copy. Only sets
   *  whose `id` is not already present are installed — a set the user drew
   *  into before the async read resolved keeps its in-memory version, so the
   *  seed can never clobber a pre-seed draw. Also sets `activeSetId` to the
   *  first own set if not already set. The sync middleware sets its persisted
   *  baseline to the read result, so untouched seeded sets diff to zero (no
   *  write-back of what was just read) while a pre-seed draw absent from the
   *  baseline still diffs and gets written. */
  seedAnnotations: (sets: AnnotationSet[]) => void;
  /** Ensure an own set exists and is active; returns its id. If `activeSetId`
   *  already points to a live own set, returns it. If no own set exists, creates
   *  one (UUID) and activates it. Called at draw time before `updateSetFeatures`. */
  ensureOwnSet: () => string;
  /** Create an empty annotation set outright (minted default name,
   *  `generateSetName`), make it the active set, and return its id — the
   *  Add-set control's "New annotation set" entry. Enters the undo history. */
  createAnnotationSet: () => string;
  /** Replace one set's features (draw/move/delete). Immer gives that set a
   *  fresh array ref, which the sync middleware diffs → writes that sidecar. */
  updateSetFeatures: (setId: string, features: AnnotationFeature[]) => void;
  /** Delete an annotation set outright — removes the set, its view state, and
   *  any selection into it. The sync middleware sees the set vanish from the
   *  baseline and DELETEs its sidecar file; the mutation enters the undo
   *  history (undo restores the set, and the sync re-writes the sidecar). */
  deleteAnnotationSet: (setId: string) => void;
  /** Rename an annotation set (display name, persisted in `cytario.name`).
   *  An empty/whitespace name clears it, falling back to the positional
   *  "Annotation Set N" label. Enters the undo history. */
  renameAnnotationSet: (setId: string, name: string) => void;
  /** Recolor every feature of a classification within one set. */
  setAnnotationClassColor: (setId: string, name: string, color: RGB) => void;
  /** Assign (or, with `name: null`, clear to unclassified) the classification of
   *  a set of features by `feature.id` — the single primitive behind classify,
   *  move-to-class, and clear. A new class name auto-picks a palette color; an
   *  existing name reuses its color. Naming the Unclassified group routes here
   *  with that group's ids (its members carry no `classification` to rename). */
  setAnnotationClassForIds: (setId: string, ids: string[], name: string | null) => void;
  /** Duplicate the given features into a set as new independent annotations:
   *  fresh id/name/timestamps, the source's geometry (translated by `offset`
   *  when given) and classification copied verbatim. The selection is replaced
   *  with the new ids; enters the undo history like region creation. Returns
   *  the new feature ids. */
  duplicateAnnotations: (
    setId: string,
    sources: AnnotationFeature[],
    offset?: [number, number],
  ) => string[];
  /** Rename a class, reassigning every member; merges into the target's color if
   *  it already exists, and follows the active class. Rejects the reserved
   *  "Unclassified" name (naming the null bucket goes through setAnnotationClassForIds). */
  renameAnnotationClass: (setId: string, oldName: string, newName: string) => void;
  /** Rename a single annotation by feature id (sets `properties.name`). Names
   *  are not required to be unique — two regions can share a name. An empty
   *  name clears it (the feature falls back to ID display). */
  renameAnnotation: (setId: string, id: string, name: string) => void;
  /** Set the own-set active class (`null` = draw unclassified). */
  setAnnotationActiveClass: (name: string | null) => void;
  /** Create an empty own-set class (auto-named/colored if unspecified) and make
   *  it active; returns the created (uniquified) name so the caller can open it
   *  for renaming. Reserved names are ignored (returns ""). */
  createAnnotationClass: (name?: string) => string;
  /** Delete an own-set class: drop it from the registry, clear it from any
   *  member features (→ unclassified), and clear the active class if it matched. */
  deleteAnnotationClass: (setId: string, name: string) => void;
  /** Set the whole annotation layer's opacity (0–1). */
  setAnnotationsOpacity: (opacity: number) => void;
  /** Toggle annotation outlines (strokes) on/off. */
  setShowAnnotationOutline: (show: boolean) => void;
  /** Show/hide ALL of one set's annotations at once (hides every class the
   *  set's features currently use; showing clears that set's hidden set). */
  setAnnotationSetHidden: (setId: string, hidden: boolean) => void;
  /** Show/hide a classification within ONE set (display only). */
  toggleAnnotationClassVisibility: (setId: string, name: string) => void;
  /** Ensure a class is visible for ONE set (idempotent un-hide) — e.g. after
   *  drawing into it, so a new region is never born into a hidden class. */
  showAnnotationClass: (setId: string, name: string) => void;
  setAnnotationMode: (mode: AnnotationMode) => void;
  setAnnotationSelectedIds: (ids: string[]) => void;
}

/** Per-image annotation state. Features live on S3 (one sidecar per set); this
 *  slice holds the working copy + view state. Persistence is the sync middleware
 *  (`attachAnnotationSync`), bound to the store — never serialized here. */
export const createAnnotationsSlice: ViewerSlice<AnnotationsSlice> = (set, get, store) => ({
  annotationSets: [],
  activeSetId: null,
  annotationMode: "view",
  annotationSelectedIds: [],
  annotationView: {},
  annotationActiveClass: null,
  annotationClasses: [],

  seedAnnotations: (sets) => {
    // Pause temporal tracking around the seed so the one-time S3 read does
    // not enter the undo history. Without this, the seed would be the first
    // past state — undoing immediately after load would wipe all annotations.
    // `store.temporal` is added by the zundo middleware (innermost); the cast
    // is needed because the slice's StateCreator type doesn't model it.
    const temporalStore = (
      store as unknown as {
        temporal?: { getState: () => { pause: () => void; resume: () => void } };
      }
    ).temporal;
    temporalStore?.getState().pause();
    try {
      set(
        (viewerStore) => {
          for (const set of sets) {
            if (!viewerStore.annotationSets.some((s) => s.id === set.id)) {
              viewerStore.annotationSets.push(set);
            }
          }
          if (!viewerStore.activeSetId) {
            const first = viewerStore.annotationSets[0];
            if (first) viewerStore.activeSetId = first.id;
          }
        },
        false,
        "seedAnnotations",
      );
    } finally {
      temporalStore?.getState().resume();
    }
  },

  ensureOwnSet: () => {
    const state = get();
    if (state.activeSetId) {
      return state.activeSetId;
    }
    const first = state.annotationSets[0];
    const temporalStore = (
      store as unknown as {
        temporal?: { getState: () => { pause: () => void; resume: () => void } };
      }
    ).temporal;
    temporalStore?.getState().pause();
    try {
      if (first) {
        set(
          (viewerStore) => {
            viewerStore.activeSetId = first.id;
          },
          false,
          "ensureOwnSet",
        );
        return first.id;
      }
      const id = crypto.randomUUID();
      set(
        (viewerStore) => {
          viewerStore.annotationSets.push({
            id,
            createdBy: viewerStore.currentUserId,
            features: [],
            name: generateSetName(viewerStore.annotationSets),
          });
          viewerStore.activeSetId = id;
        },
        false,
        "ensureOwnSet",
      );
      return id;
    } finally {
      temporalStore?.getState().resume();
    }
  },

  createAnnotationSet: () => {
    const id = crypto.randomUUID();
    set(
      (viewerStore) => {
        viewerStore.annotationSets.push({
          id,
          createdBy: viewerStore.currentUserId,
          features: [],
          name: generateSetName(viewerStore.annotationSets),
        });
        viewerStore.activeSetId = id;
      },
      false,
      "createAnnotationSet",
    );
    return id;
  },

  updateSetFeatures: (setId, features) => {
    set(
      (viewerStore) => {
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (set) {
          set.features = features;
        }
      },
      false,
      "updateSetFeatures",
    );
  },

  deleteAnnotationSet: (setId) => {
    set(
      (viewerStore) => {
        const index = viewerStore.annotationSets.findIndex((s) => s.id === setId);
        if (index === -1) return;
        viewerStore.annotationSets.splice(index, 1);
        delete viewerStore.annotationView[setId];
        if (viewerStore.activeSetId === setId) {
          viewerStore.activeSetId = viewerStore.annotationSets[0]?.id ?? null;
        }
        // Drop selection entries pointing at the deleted set's features.
        const survivorIds = new Set(
          viewerStore.annotationSets.flatMap((s) =>
            s.features.flatMap((f) => (f.id ? [f.id] : [])),
          ),
        );
        viewerStore.annotationSelectedIds = viewerStore.annotationSelectedIds.filter((id) =>
          survivorIds.has(id),
        );
      },
      false,
      "deleteAnnotationSet",
    );
  },

  renameAnnotationSet: (setId, name) => {
    set(
      (viewerStore) => {
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (set) set.name = name.trim() || undefined;
      },
      false,
      "renameAnnotationSet",
    );
  },

  setAnnotationClassColor: (setId, name, color) =>
    set(
      (viewerStore) => {
        const entry = viewerStore.annotationClasses.find((c) => c.name === name);
        if (entry) entry.color = color;
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (set) {
          for (const feature of set.features) {
            if (feature.properties?.classification?.name === name) {
              feature.properties.classification.color = color;
            }
          }
        }
      },
      false,
      "setAnnotationClassColor",
    ),

  setAnnotationClassForIds: (setId, ids, name) =>
    set(
      (viewerStore) => {
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (!set) return;
        const idSet = new Set(ids);
        // A reserved/empty name clears to unclassified (absence, not a named class).
        const target = name && !isReservedClassName(name) ? name : null;
        // One color for the whole batch: registry/existing color, else a fresh one.
        const color = target
          ? (classColor(viewerStore.annotationClasses, set.features, target) ??
            pickClassColor(viewerStore.annotationClasses, set.features))
          : null;
        // Assigning to a not-yet-registered name registers it (classified names are classes).
        if (target && color && !viewerStore.annotationClasses.some((c) => c.name === target)) {
          viewerStore.annotationClasses.push({ name: target, color });
        }
        for (const feature of set.features) {
          if (!idSet.has(feature.id)) continue;
          if (target && color) {
            feature.properties.classification = { name: target, color };
          } else {
            delete feature.properties.classification;
          }
        }
      },
      false,
      "setAnnotationClassForIds",
    ),

  duplicateAnnotations: (setId, sources, offset) => {
    const created: string[] = [];
    set(
      (viewerStore) => {
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (!set || sources.length === 0) return;
        const now = new Date().toISOString();
        // generateAnnotationName runs against the features named so far —
        // pre-seeded with the set, extended as duplicate names are minted.
        const named = [...set.features];
        for (const source of sources) {
          const classification = source.properties?.classification;
          const feature: AnnotationFeature = {
            type: "Feature",
            id: crypto.randomUUID(),
            geometry: offset ? translateGeometry(source.geometry, offset) : source.geometry,
            properties: {
              ...source.properties,
              // A copy owns its classification: later renames/recolors of the
              // source's class object must not bleed into the duplicate.
              ...(classification ? { classification: { ...classification } } : {}),
              name: generateAnnotationName(named),
              createdAt: now,
              updatedAt: now,
            },
          };
          named.push(feature);
          set.features.push(feature);
          created.push(feature.id);
        }
        viewerStore.annotationSelectedIds = created;
      },
      false,
      "duplicateAnnotations",
    );
    return created;
  },

  renameAnnotationClass: (setId, oldName, newName) =>
    set(
      (viewerStore) => {
        if (isReservedClassName(newName) || isReservedClassName(oldName)) return;
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        const features = set?.features ?? [];
        // Adopt the target class's color when renaming merges into an existing class.
        const mergeColor = classColor(viewerStore.annotationClasses, features, newName);
        for (const feature of features) {
          const classification = feature.properties.classification;
          if (classification?.name === oldName) {
            classification.name = newName;
            if (mergeColor) classification.color = mergeColor;
          }
        }
        // Registry: merge into an existing target (drop old), else rename in place.
        if (viewerStore.annotationClasses.some((c) => c.name === newName)) {
          viewerStore.annotationClasses = viewerStore.annotationClasses.filter(
            (c) => c.name !== oldName,
          );
        } else {
          const oldEntry = viewerStore.annotationClasses.find((c) => c.name === oldName);
          if (oldEntry) oldEntry.name = newName;
        }
        if (viewerStore.annotationActiveClass === oldName)
          viewerStore.annotationActiveClass = newName;
      },
      false,
      "renameAnnotationClass",
    ),

  renameAnnotation: (setId, id, name) =>
    set(
      (viewerStore) => {
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (!set) return;
        const feature = set.features.find((f) => f.id === id);
        if (!feature) return;
        const trimmed = name.trim();
        if (trimmed.length === 0) {
          delete feature.properties.name;
        } else {
          feature.properties.name = trimmed;
        }
      },
      false,
      "renameAnnotation",
    ),

  setAnnotationActiveClass: (name) =>
    set(
      (viewerStore) => {
        viewerStore.annotationActiveClass = name;
      },
      false,
      "setAnnotationActiveClass",
    ),

  createAnnotationClass: (name) => {
    let created = "";
    set(
      (viewerStore) => {
        const base = (name ?? "New class").trim() || "New class";
        if (isReservedClassName(base)) return;
        const taken = new Set(viewerStore.annotationClasses.map((c) => c.name.toLowerCase()));
        let unique = base;
        for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`;
        viewerStore.annotationClasses.push({
          name: unique,
          color: pickClassColor(viewerStore.annotationClasses, []),
        });
        viewerStore.annotationActiveClass = unique;
        created = unique;
      },
      false,
      "createAnnotationClass",
    );
    return created;
  },

  deleteAnnotationClass: (setId, name) =>
    set(
      (viewerStore) => {
        viewerStore.annotationClasses = viewerStore.annotationClasses.filter(
          (c) => c.name !== name,
        );
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        if (set) {
          for (const feature of set.features) {
            if (feature.properties?.classification?.name === name) {
              delete feature.properties.classification;
            }
          }
        }
        if (viewerStore.annotationActiveClass === name) viewerStore.annotationActiveClass = null;
      },
      false,
      "deleteAnnotationClass",
    ),

  toggleAnnotationClassVisibility: (setId, name) =>
    set(
      (viewerStore) => {
        const view = (viewerStore.annotationView[setId] ??= { hiddenClasses: [] });
        const index = view.hiddenClasses.indexOf(name);
        if (index === -1) view.hiddenClasses.push(name);
        else view.hiddenClasses.splice(index, 1);
      },
      false,
      "toggleAnnotationClassVisibility",
    ),

  showAnnotationClass: (setId, name) =>
    set(
      (viewerStore) => {
        const hidden = viewerStore.annotationView[setId]?.hiddenClasses;
        const index = hidden?.indexOf(name) ?? -1;
        if (hidden && index !== -1) hidden.splice(index, 1);
      },
      false,
      "showAnnotationClass",
    ),

  setAnnotationsOpacity: (opacity) =>
    set(
      (viewerStore) => {
        const activeImagePanelIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
        const layerState = viewerStore.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.annotationsOpacity = opacity;
        }
      },
      false,
      "setAnnotationsOpacity",
    ),

  setShowAnnotationOutline: (show) =>
    set(
      (viewerStore) => {
        const activeImagePanelIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
        const layerState = viewerStore.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.showAnnotationOutline = show;
        }
      },
      false,
      "setShowAnnotationOutline",
    ),

  setAnnotationSetHidden: (setId, hidden) =>
    set(
      (viewerStore) => {
        const view = (viewerStore.annotationView[setId] ??= { hiddenClasses: [] });
        const set = viewerStore.annotationSets.find((s) => s.id === setId);
        view.hiddenClasses = hidden ? [...new Set((set?.features ?? []).map(classNameOf))] : [];
      },
      false,
      "setAnnotationSetHidden",
    ),

  setAnnotationMode: (mode) =>
    set(
      (viewerStore) => {
        viewerStore.annotationMode = mode;
      },
      false,
      "setAnnotationMode",
    ),

  setAnnotationSelectedIds: (ids) =>
    set(
      (viewerStore) => {
        viewerStore.annotationSelectedIds = ids;
      },
      false,
      "setAnnotationSelectedIds",
    ),
});
