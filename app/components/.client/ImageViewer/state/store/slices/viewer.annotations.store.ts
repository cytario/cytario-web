import { CATEGORICAL_COLORS } from "../../../categoricalColors";
import type { AnnotationMode, RGB, ViewerSlice, ViewerStore } from "../types";
import type { AnnotationFeature, AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";

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

/** RGB view of the shared categorical palette (drops the palette's alpha). */
const PALETTE: RGB[] = CATEGORICAL_COLORS.map(([r, g, b]): RGB => [r, g, b]);

const colorKey = (c: RGB): string => c.join(",");

/** The color already assigned to a class of this name — the registry first (so
 *  an empty defined class keeps its color), then any member feature. */
const classColor = (
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

/** Per-user view state — ephemeral, never persisted (lives apart from the
 *  S3-backed `annotationsByUser` so a view change can't trigger a sidecar write). */
export interface UserAnnotationView {
  /** Classification names hidden for THIS user's set (per-user, not global). */
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

/** A single user's feature set from the map (or a stable empty array). */
export const selectUserFeatures =
  (userId: string | undefined) =>
  (state: ViewerStore): AnnotationFeature[] =>
    (userId && state.annotationsByUser[userId]) || NO_FEATURES;

/** A single user's hidden classification names (stable empty array by default). */
export const selectUserHiddenClasses =
  (userId: string | undefined) =>
  (state: ViewerStore): string[] =>
    (userId ? state.annotationView[userId]?.hiddenClasses : undefined) ?? NO_HIDDEN;

export interface AnnotationsSlice {
  /** Every user's annotations, keyed by Keycloak `sub` — the single source of
   *  truth. Own is just `annotationsByUser[ownSub]`; no own/peer split is stored.
   *  Edit-others (future, role-gated) writes another key, same as own. */
  annotationsByUser: AnnotationsByUser;
  annotationMode: AnnotationMode;
  /** `feature.id`s of selected features — stable across edits/reorders,
   *  unlike array indexes. Resolved to deck `selectedFeatureIndexes` at render. */
  annotationSelectedIds: string[];
  /** Per-user view state (hidden classes), keyed by `sub`. Kept apart from
   *  `annotationsByUser` so a view change never enters the persist diff. */
  annotationView: Record<string, UserAnnotationView>;
  /** Opacity of the whole annotation layer (all users), 0–1. Section-level,
   *  ephemeral — mirrors the channels/overlays opacity control. */
  annotationsOpacity: number;
  /** Own-set class into which newly drawn regions are placed; `null` = draw
   *  unclassified. Resolved to `classification` only when a region commits.
   *  Browser-persisted per image (a "settings" sidecar is the eventual home). */
  annotationActiveClass: string | null;
  /** Own-set class registry — defined classes (name + color), including ones
   *  with zero members. Browser-persisted per image. Peers derive classes from
   *  their features and have no registry. */
  annotationClasses: AnnotationClass[];

  /** Merge the per-user map from the one-time S3 read into the working copy.
   *  Only keys not already present are installed — a user who drew a region
   *  before the async read resolved keeps their in-memory version, so the seed
   *  can never clobber a pre-seed draw. The sync middleware sets its persisted
   *  baseline to the read result, so untouched seeded keys diff to zero (no
   *  write-back of what was just read) while a pre-seed draw absent from the
   *  baseline still diffs and gets written. */
  seedAnnotations: (byUser: AnnotationsByUser) => void;
  /** Replace one user's features (draw/move/delete). Immer gives that key a
   *  fresh array ref, which the sync middleware diffs → writes that sidecar. */
  updateUserFeatures: (userId: string, features: AnnotationFeature[]) => void;
  /** Recolor every feature of a classification within one user's set. */
  setAnnotationClassColor: (userId: string, name: string, color: RGB) => void;
  /** Assign (or, with `name: null`, clear to unclassified) the classification of
   *  a set of features by `feature.id` — the single primitive behind classify,
   *  move-to-class, and clear. A new class name auto-picks a palette color; an
   *  existing name reuses its color. Naming the Unclassified group routes here
   *  with that group's ids (its members carry no `classification` to rename). */
  setAnnotationClassForIds: (userId: string, ids: string[], name: string | null) => void;
  /** Rename a class, reassigning every member; merges into the target's color if
   *  it already exists, and follows the active class. Rejects the reserved
   *  "Unclassified" name (naming the null bucket goes through setAnnotationClassForIds). */
  renameAnnotationClass: (userId: string, oldName: string, newName: string) => void;
  /** Set the own-set active class (`null` = draw unclassified). */
  setAnnotationActiveClass: (name: string | null) => void;
  /** Create an empty own-set class (auto-named/colored if unspecified) and make
   *  it active; returns the created (uniquified) name so the caller can open it
   *  for renaming. Reserved names are ignored (returns ""). */
  createAnnotationClass: (name?: string) => string;
  /** Delete an own-set class: drop it from the registry, clear it from any
   *  member features (→ unclassified), and clear the active class if it matched. */
  deleteAnnotationClass: (userId: string, name: string) => void;
  /** Set the whole annotation layer's opacity (0–1). */
  setAnnotationsOpacity: (opacity: number) => void;
  /** Show/hide ALL of one user's annotations at once (hides every class the
   *  user's features currently use; showing clears that user's hidden set). */
  setAnnotationUserHidden: (userId: string, hidden: boolean) => void;
  /** Show/hide a classification within ONE user's set (display only). */
  toggleAnnotationClassVisibility: (userId: string, name: string) => void;
  /** Ensure a class is visible for ONE user (idempotent un-hide) — e.g. after
   *  drawing into it, so a new region is never born into a hidden class. */
  showAnnotationClass: (userId: string, name: string) => void;
  setAnnotationMode: (mode: AnnotationMode) => void;
  setAnnotationSelectedIds: (ids: string[]) => void;
}

/** Per-image annotation state. Features live on S3 (one sidecar per user); this
 *  slice holds the working copy + view state. Persistence is the sync middleware
 *  (`attachAnnotationSync`), bound to the store — never serialized here. */
export const createAnnotationsSlice: ViewerSlice<AnnotationsSlice> = (set) => ({
  annotationsByUser: {},
  annotationMode: "view",
  annotationSelectedIds: [],
  annotationView: {},
  annotationActiveClass: null,
  annotationClasses: [],
  annotationsOpacity: 1,

  seedAnnotations: (byUser) =>
    set(
      (state) => {
        // Merge, not replace: a key the user already touched (drew into) before
        // this async read resolved wins — installing only absent keys prevents
        // the seed from clobbering a pre-seed draw.
        for (const [userId, features] of Object.entries(byUser)) {
          if (state.annotationsByUser[userId] === undefined) {
            state.annotationsByUser[userId] = features;
          }
        }
      },
      false,
      "seedAnnotations",
    ),

  updateUserFeatures: (userId, features) =>
    set(
      (state) => {
        state.annotationsByUser[userId] = features;
      },
      false,
      "updateUserFeatures",
    ),

  setAnnotationClassColor: (userId, name, color) =>
    set(
      (state) => {
        const entry = state.annotationClasses.find((c) => c.name === name);
        if (entry) entry.color = color;
        const features = state.annotationsByUser[userId];
        if (features) {
          for (const feature of features) {
            if (feature.properties?.classification?.name === name) {
              feature.properties.classification.color = color;
            }
          }
        }
      },
      false,
      "setAnnotationClassColor",
    ),

  setAnnotationClassForIds: (userId, ids, name) =>
    set(
      (state) => {
        const features = state.annotationsByUser[userId];
        if (!features) return;
        const idSet = new Set(ids);
        // A reserved/empty name clears to unclassified (absence, not a named class).
        const target = name && !isReservedClassName(name) ? name : null;
        // One color for the whole batch: registry/existing color, else a fresh one.
        const color = target
          ? (classColor(state.annotationClasses, features, target) ??
            pickClassColor(state.annotationClasses, features))
          : null;
        // Assigning to a not-yet-registered name registers it (classified names are classes).
        if (target && color && !state.annotationClasses.some((c) => c.name === target)) {
          state.annotationClasses.push({ name: target, color });
        }
        for (const feature of features) {
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

  renameAnnotationClass: (userId, oldName, newName) =>
    set(
      (state) => {
        if (isReservedClassName(newName) || isReservedClassName(oldName)) return;
        const features = state.annotationsByUser[userId] ?? [];
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

  deleteAnnotationClass: (userId, name) =>
    set(
      (state) => {
        state.annotationClasses = state.annotationClasses.filter((c) => c.name !== name);
        const features = state.annotationsByUser[userId];
        if (features) {
          for (const feature of features) {
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

  toggleAnnotationClassVisibility: (userId, name) =>
    set(
      (state) => {
        const view = (state.annotationView[userId] ??= { hiddenClasses: [] });
        const index = view.hiddenClasses.indexOf(name);
        if (index === -1) view.hiddenClasses.push(name);
        else view.hiddenClasses.splice(index, 1);
      },
      false,
      "toggleAnnotationClassVisibility",
    ),

  showAnnotationClass: (userId, name) =>
    set(
      (state) => {
        const hidden = state.annotationView[userId]?.hiddenClasses;
        const index = hidden?.indexOf(name) ?? -1;
        if (hidden && index !== -1) hidden.splice(index, 1);
      },
      false,
      "showAnnotationClass",
    ),

  setAnnotationsOpacity: (opacity) =>
    set(
      (state) => {
        state.annotationsOpacity = opacity;
      },
      false,
      "setAnnotationsOpacity",
    ),

  setAnnotationUserHidden: (userId, hidden) =>
    set(
      (state) => {
        const view = (state.annotationView[userId] ??= { hiddenClasses: [] });
        view.hiddenClasses = hidden
          ? [...new Set((state.annotationsByUser[userId] ?? []).map(classNameOf))]
          : [];
      },
      false,
      "setAnnotationUserHidden",
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
