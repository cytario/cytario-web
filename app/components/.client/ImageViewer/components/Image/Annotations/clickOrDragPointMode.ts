import {
  DrawPointMode,
  type FeatureCollection,
  type ModeProps,
  type SimpleFeatureCollection,
  type StartDraggingEvent,
  type StopDraggingEvent,
} from "@deck.gl-community/editable-layers";

/**
 * Point placement tolerant of a slight drag. `DrawPointMode` commits only on a
 * clean click, but deck suppresses `onClick` once the pointer moves past its
 * drag threshold — so a not-quite-still press drops nothing. Committing on
 * pointer-up as well makes any press place a point. (In a draw mode the camera
 * doesn't pan, so a press-drag has no other meaning.)
 */
export class ClickOrDragPointMode extends DrawPointMode {
  handleStartDragging(event: StartDraggingEvent) {
    event.cancelPan();
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<FeatureCollection>) {
    const geometry = { type: "Point" as const, coordinates: event.mapCoords };
    // `props.data` is the broad FeatureCollection; getAddFeatureAction wants the
    // stricter SimpleFeatureCollection — same narrowing the base modes do.
    props.onEdit(this.getAddFeatureAction(geometry, props.data as SimpleFeatureCollection));
  }
}
