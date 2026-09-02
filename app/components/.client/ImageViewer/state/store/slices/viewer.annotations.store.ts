import { CATEGORICAL_COLORS } from "../../../categoricalColors";
import type { AnnotationMode, RGB, ViewerSlice, ViewerStore } from "../types";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

/** Group name for features without a classification.
 *
 *  Invariant: a feature is unclassified iff `properties.classification` is
 *  absent — we never persist a synthetic class named "Unclassified" (that keeps
 *  the on-disk shape aligned with the QuPath/RFC-7946 "absence = unclassified"
 *  convention the read/write schema relies on). The "Unclassified" group is a
 *  view-model construct only: grouping collapses the null case to this name via
 *  `classNameOf`, and the name is reserved so it can't become a real class. */
export const UNCLASSIFIED = "Unclassified";

/** Fallback color for features/groups without a classification — a neutral gray,
 *  shared by the canvas layer, the group-row dot, and the sidebar thumbnail so
 *  "Unclassified" looks identical everywhere. */
export const UNCLASSIFIED_COLOR: RGB = [120, 120, 120];

/** A feature's classification name, or the `Unclassified` fallback. Shared by
 *  the list grouping and the layer's visibility check so they agree on keys. */
export const classNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.classification?.name ?? UNCLASSIFIED;

/** "Unclassified" is the reserved view-model bucket, never a real class name. */
export const isReservedClassName = (name: string): boolean =>
  name.trim().toLowerCase() === UNCLASSIFIED.toLowerCase();

/** Generates the next auto-incrementing annotation name as a zero-padded
 *  4-digit index ("0001", "0002", …, "0242", "22358") skipping any already
 *  taken by an existing feature. Called at draw time so every new region is
 *  born with a unique name. */
export const generateAnnotationName = (features: AnnotationFeature[]): string => {
  const taken = new Set(
    features
      .map((f) => f.properties?.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0),
  );
  for (let n = 1; ; n++) {
    const candidate = String(n).padStart(4, "0");
    if (!taken.has(candidate)) return candidate;
  }
};

/** The display name of a feature: its `properties.name` if set, else a
 *  fallback showing the ID (for legacy/imported features that predate
 *  auto-naming). Shared by the tooltip and the sidebar label so they agree. */
export const annotationNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.name ?? `ID: ${feature.id}`;

/** RGB view of the shared categorical palette (drops the palette's alpha). */
const PALETTE: RGB[] = CATEGORICAL_COLORS.map(([r, g, b]): RGB => [r, g, b]);

const colorKey = (c: RGB): string => c.join(",");

/** The color already assigned to a class of this name — the registry first (so
 *  an empty defined class keeps its color), then any member feature. */
export const classColor = (
  classes: AnnotationClass[],
  features: AnnotationFeature[],
  name: string,
): RGB | undefined =>
  classes.find((c) => c.name === name)?.color ??
  features.find((f) => f.properties?.classification?.name === name)?.properties?.classification
    ?.color;

/** A palette color not used by any class (registry or feature), cycling once
 *  exhausted, skipping the unclassified gray so a class never looks unclassified. */
const pickClassColor = (classes: AnnotationClass[], features: AnnotationFeature[]): RGB => {
  const used = new Set<string>();
  for (const c of classes) used.add(colorKey(c.color));
  for (const f of features) {
    const c = f.properties?.classification?.color;
    if (c) used.add(colorKey(c));
  }
  return PALETTE.find((c) => !used.has(colorKey(c))) ?? PALETTE[used.size % PALETTE.length];
};

/** Per-set view state — ephemeral, never persisted (lives apart from the
 *  S3-backed `annotationSets` so a view change can't trigger a sidecar write). */
export interface SetAnnotationView {
  /** Classification names hidden for THIS set. */
  hiddenClasses: string[];
}

/** A defined classification for the own set: a name + color that exists
 *  independently of any feature, so a class can be pre-created and kept empty. */
export interface AnnotationClass {
  name: string;
  color: RGB;
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
  /** Replace one set's features (draw/move/delete). Immer gives that set a
   *  fresh array ref, which the sync middleware diffs → writes that sidecar. */
  updateSetFeatures: (setId: string, features: AnnotationFeature[]) => void;
  /** Recolor every feature of a classification within one set. */
  setAnnotationClassColor: (setId: string, name: string, color: RGB) => void;
  /** Assign (or, with `name: null`, clear to unclassified) the classification of
   *  a set of features by `feature.id` — the single primitive behind classify,
   *  move-to-class, and clear. A new class name auto-picks a palette color; an
   *  existing name reuses its color. Naming the Unclassified group routes here
   *  with that group's ids (its members carry no `classification` to rename). */
  setAnnotationClassForIds: (setId: string, ids: string[], name: string | null) => void;
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
        (state) => {
          for (const set of sets) {
            if (!state.annotationSets.some((s) => s.id === set.id)) {
              state.annotationSets.push(set);
            }
          }
          if (!state.activeSetId) {
            const first = state.annotationSets[0];
            if (first) state.activeSetId = first.id;
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
          (s) => {
            s.activeSetId = first.id;
          },
          false,
          "ensureOwnSet",
        );
        return first.id;
      }
      const id = crypto.randomUUID();
      set(
        (s) => {
          s.annotationSets.push({ id, createdBy: s.currentUserId, features: [] });
          s.activeSetId = id;
        },
        false,
        "ensureOwnSet",
      );
      return id;
    } finally {
      temporalStore?.getState().resume();
    }
  },

  updateSetFeatures: (setId, features) => {
    set(
      (state) => {
        const set = state.annotationSets.find((s) => s.id === setId);
        if (set) {
          set.features = features;
        }
      },
      false,
      "updateSetFeatures",
    );
  },

  setAnnotationClassColor: (setId, name, color) =>
    set(
      (state) => {
        const entry = state.annotationClasses.find((c) => c.name === name);
        if (entry) entry.color = color;
        const set = state.annotationSets.find((s) => s.id === setId);
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
      (state) => {
        const set = state.annotationSets.find((s) => s.id === setId);
        if (!set) return;
        const idSet = new Set(ids);
        // A reserved/empty name clears to unclassified (absence, not a named class).
        const target = name && !isReservedClassName(name) ? name : null;
        // One color for the whole batch: registry/existing color, else a fresh one.
        const color = target
          ? (classColor(state.annotationClasses, set.features, target) ??
            pickClassColor(state.annotationClasses, set.features))
          : null;
        // Assigning to a not-yet-registered name registers it (classified names are classes).
        if (target && color && !state.annotationClasses.some((c) => c.name === target)) {
          state.annotationClasses.push({ name: target, color });
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

  renameAnnotationClass: (setId, oldName, newName) =>
    set(
      (state) => {
        if (isReservedClassName(newName) || isReservedClassName(oldName)) return;
        const set = state.annotationSets.find((s) => s.id === setId);
        const features = set?.features ?? [];
        // Adopt the target class's color when renaming merges into an existing class.
        const mergeColor = classColor(state.annotationClasses, features, newName);
        for (const feature of features) {
          const classification = feature.properties.classification;
          if (classification?.name === oldName) {
            classification.name = newName;
            if (mergeColor) classification.color = mergeColor;
          }
        }
        // Registry: merge into an existing target (drop old), else rename in place.
        if (state.annotationClasses.some((c) => c.name === newName)) {
          state.annotationClasses = state.annotationClasses.filter((c) => c.name !== oldName);
        } else {
          const oldEntry = state.annotationClasses.find((c) => c.name === oldName);
          if (oldEntry) oldEntry.name = newName;
        }
        if (state.annotationActiveClass === oldName) state.annotationActiveClass = newName;
      },
      false,
      "renameAnnotationClass",
    ),

  renameAnnotation: (setId, id, name) =>
    set(
      (state) => {
        const set = state.annotationSets.find((s) => s.id === setId);
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
      (state) => {
        state.annotationActiveClass = name;
      },
      false,
      "setAnnotationActiveClass",
    ),

  createAnnotationClass: (name) => {
    let created = "";
    set(
      (state) => {
        const base = (name ?? "New class").trim() || "New class";
        if (isReservedClassName(base)) return;
        const taken = new Set(state.annotationClasses.map((c) => c.name.toLowerCase()));
        let unique = base;
        for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`;
        state.annotationClasses.push({
          name: unique,
          color: pickClassColor(state.annotationClasses, []),
        });
        state.annotationActiveClass = unique;
        created = unique;
      },
      false,
      "createAnnotationClass",
    );
    return created;
  },

  deleteAnnotationClass: (setId, name) =>
    set(
      (state) => {
        state.annotationClasses = state.annotationClasses.filter((c) => c.name !== name);
        const set = state.annotationSets.find((s) => s.id === setId);
        if (set) {
          for (const feature of set.features) {
            if (feature.properties?.classification?.name === name) {
              delete feature.properties.classification;
            }
          }
        }
        if (state.annotationActiveClass === name) state.annotationActiveClass = null;
      },
      false,
      "deleteAnnotationClass",
    ),

  toggleAnnotationClassVisibility: (setId, name) =>
    set(
      (state) => {
        const view = (state.annotationView[setId] ??= { hiddenClasses: [] });
        const index = view.hiddenClasses.indexOf(name);
        if (index === -1) view.hiddenClasses.push(name);
        else view.hiddenClasses.splice(index, 1);
      },
      false,
      "toggleAnnotationClassVisibility",
    ),

  showAnnotationClass: (setId, name) =>
    set(
      (state) => {
        const hidden = state.annotationView[setId]?.hiddenClasses;
        const index = hidden?.indexOf(name) ?? -1;
        if (hidden && index !== -1) hidden.splice(index, 1);
      },
      false,
      "showAnnotationClass",
    ),

  setAnnotationsOpacity: (opacity) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.annotationsOpacity = opacity;
        }
      },
      false,
      "setAnnotationsOpacity",
    ),

  setShowAnnotationOutline: (show) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];
        if (layerState) {
          layerState.showAnnotationOutline = show;
        }
      },
      false,
      "setShowAnnotationOutline",
    ),

  setAnnotationSetHidden: (setId, hidden) =>
    set(
      (state) => {
        const view = (state.annotationView[setId] ??= { hiddenClasses: [] });
        const set = state.annotationSets.find((s) => s.id === setId);
        view.hiddenClasses = hidden ? [...new Set((set?.features ?? []).map(classNameOf))] : [];
      },
      false,
      "setAnnotationSetHidden",
    ),

  setAnnotationMode: (mode) =>
    set(
      (state) => {
        state.annotationMode = mode;
      },
      false,
      "setAnnotationMode",
    ),

  setAnnotationSelectedIds: (ids) =>
    set(
      (state) => {
        state.annotationSelectedIds = ids;
      },
      false,
      "setAnnotationSelectedIds",
    ),
});
