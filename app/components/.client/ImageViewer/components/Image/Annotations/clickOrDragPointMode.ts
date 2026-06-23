import {
  DrawPointMode,
  type ClickEvent,
  type FeatureCollection,
  type ModeProps,
  type Position,
  type SimpleFeatureCollection,
  type StartDraggingEvent,
  type StopDraggingEvent,
} from "@deck.gl-community/editable-layers";

// A sub-threshold drag fires `panend` AND a trailing native `click` for the
// same gesture (deck's click tolerance > Hammer's 10px pan threshold), which
// would place two points. Ignore a click landing within this window of a
// drag-end — distinct gestures are always far further apart than this.
const CLICK_AFTER_DRAG_MS = 100;

/**
 * Point placement tolerant of a slight drag. `DrawPointMode` commits only on a
 * clean click, but deck suppresses `onClick` once the pointer passes its drag
 * threshold — so a not-quite-still press drops nothing. This also commits on
 * pointer-up, and de-dupes the trailing click so one gesture = one point.
 */
export class ClickOrDragPointMode extends DrawPointMode {
  private lastDragEndAt = 0;

  handleStartDragging(event: StartDraggingEvent) {
    event.cancelPan();
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<FeatureCollection>) {
    this.lastDragEndAt = Date.now();
    this.addPoint(event.mapCoords, props);
  }

  handleClick(event: ClickEvent, props: ModeProps<SimpleFeatureCollection>) {
    if (Date.now() - this.lastDragEndAt < CLICK_AFTER_DRAG_MS) return; // trailing click of a drag
    super.handleClick(event, props);
  }

  private addPoint(coordinates: Position, props: ModeProps<FeatureCollection>) {
    const geometry = { type: "Point" as const, coordinates };
    props.onEdit(this.getAddFeatureAction(geometry, props.data as SimpleFeatureCollection));
  }
}
