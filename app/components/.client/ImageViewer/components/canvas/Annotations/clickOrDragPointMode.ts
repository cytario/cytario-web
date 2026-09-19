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

// A sub-threshold drag fires both `panend` and a trailing native `click` for the same
// gesture — ignoring the click keeps one gesture = one point.
const CLICK_AFTER_DRAG_MS = 100;

/** Commits on pointer-up too: deck suppresses `onClick` once the pointer passes its drag threshold. */
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
    if (Date.now() - this.lastDragEndAt < CLICK_AFTER_DRAG_MS) return;
    super.handleClick(event, props);
  }

  private addPoint(coordinates: Position, props: ModeProps<FeatureCollection>) {
    const geometry = { type: "Point" as const, coordinates };
    props.onEdit(this.getAddFeatureAction(geometry, props.data as SimpleFeatureCollection));
  }
}
