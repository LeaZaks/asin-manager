import { useRef, useState } from "react";

const MIN_WIDTH = 50;
const MAX_WIDTH = 600;

export function useResizableColumns(initialWidths: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(initialWidths);
  const dragging = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // onMouseDown is defined inline so it always closes over latest widths
  // but does NOT trigger re-renders by itself
  function onMouseDown(col: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = { col, startX: e.clientX, startWidth: widths[col] ?? 100 };

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const delta = ev.clientX - dragging.current.startX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragging.current.startWidth + delta));
      // Use functional update - does not depend on external state
      setWidths((prev) => {
        if (prev[dragging.current!.col] === newWidth) return prev; // bail if unchanged
        return { ...prev, [dragging.current!.col]: newWidth };
      });
    }

    function onMouseUp() {
      dragging.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return { widths, onMouseDown };
}