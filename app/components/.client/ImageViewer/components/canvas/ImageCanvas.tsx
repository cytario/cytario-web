import { useToast } from "@cytario/design";
import { useRef, useState } from "react";

import { ImagePanel } from "./ImagePanel";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { Toolbar } from "../Toolbar";
import { isAnnotationImportFile, parseAnnotationImportFile } from "~/utils/db/annotationImport";

/** Canvas area: renders N ImagePanels + floating Toolbar. Dragging annotation
 *  export files (.json/.geojson) onto the canvas imports them as unowned
 *  annotation sets (same validation path as the sidebar's file input). */
export const ImageCanvas = () => {
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const seedAnnotations = useViewerStore((s) => s.seedAnnotations);
  const canAnnotate = useCanAnnotate();
  const { toast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);

  // dragenter/leave fire for every child crossing; count depth so the
  // overlay stays up while the pointer is anywhere inside the canvas.
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  const onDrop = async (e: React.DragEvent) => {
    const files = [...e.dataTransfer.files].filter(isAnnotationImportFile);
    dragDepth.current = 0;
    setIsDragOver(false);
    if (files.length === 0) return;
    e.preventDefault();

    // Read-only grants can never persist an import — reject visibly instead
    // of seeding a set that would silently vanish on reload.
    if (!canAnnotate) {
      toast({
        variant: "error",
        message: "This connection is read-only — annotations cannot be imported.",
      });
      return;
    }

    for (const file of files) {
      try {
        const features = await parseAnnotationImportFile(file);
        seedAnnotations([
          {
            id: crypto.randomUUID(),
            createdBy: undefined,
            name: file.name,
            features,
          },
        ]);
      } catch (err) {
        toast({
          variant: "error",
          message: err instanceof Error ? err.message : `Failed to import "${file.name}"`,
        });
      }
    }
  };

  return (
    <div
      className="relative flex w-full h-full"
      onDragEnter={(e) => {
        if (!hasFiles(e) || !canAnnotate) return; // no drop-zone hint when it can't land
        e.preventDefault();
        dragDepth.current += 1;
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragOver(false);
      }}
      onDrop={onDrop}
    >
      {imagePanels.map((_, index) => (
        <ImagePanel key={index} imagePanelId={index} />
      ))}

      <Toolbar />

      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10">
          <p className="rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow">
            Drop annotation files to import (.json / .geojson)
          </p>
        </div>
      )}
    </div>
  );
};
