import {
  DrawRectangleMode,
  type ClickEvent,
  type ModeProps,
  type Position,
  type SimpleFeatureCollection,
  type StartDraggingEvent,
  type StopDraggingEvent,
} from "@deck.gl-community/editable-layers";

// A sub-threshold drag fires both `panend` and a trailing native `click` for the same
// gesture — ignoring the click keeps one gesture = one shape.
const CLICK_AFTER_DRAG_MS = 100;

/**
 * Rectangle tool with two commit gestures: dragging draws a free rectangle
 * (parent `DrawRectangleMode` behavior under `dragToDraw`), a plain click
 * stamps a square of the configured edge length centered on the click point.
 * The committed geometry is a closed-ring Polygon, so persistence,
 * classification, and undo treat it like any other drawn region.
 */
export class StampBoxMode extends DrawRectangleMode {
  private lastDragEndAt = 0;

  handleStartDragging(event: StartDraggingEvent, props: ModeProps<SimpleFeatureCollection>) {
    if (!props.modeConfig?.dragToDraw) return;
    super.handleStartDragging(event, props);
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<SimpleFeatureCollection>) {
    if (!props.modeConfig?.dragToDraw) return;
    this.lastDragEndAt = Date.now();
    super.handleStopDragging(event, props);
  }

  handleClick(event: ClickEvent, props: ModeProps<SimpleFeatureCollection>) {
    if (Date.now() - this.lastDragEndAt < CLICK_AFTER_DRAG_MS) return;
    this.stampBox(event.mapCoords, props);
  }

  private stampBox(coordinates: Position, props: ModeProps<SimpleFeatureCollection>) {
    const sizeConfig = (props.modeConfig ?? {}) as {
      stampWidthPx?: number;
      stampHeightPx?: number;
    };
    const halfWidth = (sizeConfig.stampWidthPx ?? 512) / 2;
    const halfHeight = (sizeConfig.stampHeightPx ?? 512) / 2;
    const [centerX, centerY] = coordinates;
    const geometry = {
      type: "Polygon" as const,
      coordinates: [
        [
          [centerX - halfWidth, centerY - halfHeight],
          [centerX + halfWidth, centerY - halfHeight],
          [centerX + halfWidth, centerY + halfHeight],
          [centerX - halfWidth, centerY + halfHeight],
          [centerX - halfWidth, centerY - halfHeight],
        ],
      ],
    };
    this.resetClickSequence();
    const action = this.getAddFeatureOrBooleanPolygonAction(
      { type: "Feature", properties: {}, geometry },
      props,
    );
    if (action) props.onEdit(action);
  }
}
