import { MenuItem, MenuSeparator } from "@cytario/design";

import { type JoinOfferAction } from "./joinFeatures";

export interface AnnotationMenuItemsProps {
  /** Read-only surfaces (peer sets, no grant) hide rename/classify and disable delete. */
  editable: boolean;
  /** Class names offered as move targets (excludes the feature's own class). */
  classNames?: string[];
  /** Inline rename is sidebar-only — the canvas menu omits it. */
  showRename?: boolean;
  onZoom: () => void;
  onStartRename?: () => void;
  onClassify?: (name: string) => void;
  /** Clear the classification → Unclassified. */
  onClear?: () => void;
  /** Join offers: one per same-class group (≥2 regions) in the action
   *  targets — a cross-class selection yields one offer per class. */
  joinOffers?: JoinOfferAction[];
  onDelete: () => void;
}

/** Body of the annotation actions menu, shared by the sidebar thumb (kebab
 *  press + right-click) and the canvas polygon context menu. */
export const AnnotationMenuItems = ({
  editable,
  classNames,
  showRename = false,
  onZoom,
  onStartRename,
  onClassify,
  onClear,
  joinOffers,
  onDelete,
}: AnnotationMenuItemsProps) => {
  return (
    <>
      <MenuItem id="zoom" icon="ZoomIn" onAction={onZoom}>
        Zoom to annotation
      </MenuItem>
      {editable && showRename && onStartRename && (
        <MenuItem id="rename" icon="Pencil" onAction={onStartRename}>
          Rename annotation
        </MenuItem>
      )}
      {editable && onClassify && ((classNames?.length ?? 0) > 0 || onClear) && (
        <>
          <MenuSeparator />
          {(classNames ?? []).map((name) => (
            <MenuItem key={name} id={`move:${name}`} icon="Tag" onAction={() => onClassify(name)}>
              Move to {name}
            </MenuItem>
          ))}
          {onClear && (
            <MenuItem id="unclassify" icon="X" onAction={onClear}>
              Clear classification
            </MenuItem>
          )}
        </>
      )}
      {editable &&
        (joinOffers ?? []).map((offer) => (
          <MenuItem
            key={offer.className}
            id={`join:${offer.className}`}
            icon="Layers2"
            onAction={offer.onJoin}
          >
            Join {offer.count} {offer.className} annotations
          </MenuItem>
        ))}
      <MenuSeparator />
      <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!editable} onAction={onDelete}>
        Delete annotation
      </MenuItem>
    </>
  );
};
