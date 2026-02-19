import React, { useRef, useEffect } from "react";

const MIN_WIDTH = 50;
const MAX_WIDTH = 600;

const INITIAL_WIDTHS: Record<string, number> = {
  checkbox: 36,
  image: 56,
  asin: 150,
  brand: 130,
  salesRank: 70,
  buyBox: 70,
  rating: 70,
  status: 70,
  score: 100,
  tags: 90,
  notes: 200,
  checkedAt: 180,
};

const COLUMNS = [
  "checkbox","image","asin","brand","salesRank",
  "buyBox","rating","status","score","tags","notes","checkedAt",
];

interface ResizableTheadProps {
  onSort: (field: string) => void;
  sortIcon: (field: string) => string;
  toggleSelectAll: () => void;
  allSelected: boolean;
}

export const ResizableThead = React.memo(function ResizableThead({
  onSort,
  sortIcon,
  toggleSelectAll,
  allSelected,
}: ResizableTheadProps) {
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const widthsRef = useRef<Record<string, number>>({ ...INITIAL_WIDTHS });

  function applyWidths() {
    const thead = theadRef.current;
    if (!thead) return;
    const table = thead.closest("table");
    if (!table) return;
    const cols = table.querySelectorAll("col");
    const ths = thead.querySelectorAll("th");
    COLUMNS.forEach((key, i) => {
      const w = widthsRef.current[key] + "px";
      if (cols[i]) (cols[i] as HTMLElement).style.width = w;
      if (ths[i]) {
        (ths[i] as HTMLElement).style.width = w;
        (ths[i] as HTMLElement).style.minWidth = w;
        (ths[i] as HTMLElement).style.maxWidth = w;
      }
    });
  }

  // רץ בכל render — מוודא שהרוחבים תמיד נשמרים גם אחרי re-render של React
  useEffect(() => { applyWidths(); });

  function startResize(col: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widthsRef.current[col] ?? 100;
    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + ev.clientX - startX));
      widthsRef.current[col] = newWidth;
      applyWidths();
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  // style ראשוני — applyWidths ידרוס אחר כך
  const w = (key: string): React.CSSProperties => ({
    width: widthsRef.current[key],
    minWidth: widthsRef.current[key],
    maxWidth: widthsRef.current[key],
    position: "relative",
    userSelect: "none",
  });

  const rh = (col: string) => (
    <span
      className="col-resize-handle"
      onMouseDown={(e) => startResize(col, e)}
      onClick={(e) => e.stopPropagation()}
    />
  );

  return (
    <thead ref={theadRef}>
      <tr>
        <th style={w("checkbox")}>
          <input type="checkbox" className="checkbox" onChange={toggleSelectAll} checked={allSelected} />
          {rh("checkbox")}
        </th>
        <th style={w("image")}>
          Img
          {rh("image")}
        </th>
        <th style={w("asin")} onClick={() => onSort("asin")}>
          ASIN{sortIcon("asin")}
          {rh("asin")}
        </th>
        <th style={w("brand")} onClick={() => onSort("brand")}>
          Brand{sortIcon("brand")}
          {rh("brand")}
        </th>
        <th style={w("salesRank")} onClick={() => onSort("sales_rank_current")}>
          Sales Rank{sortIcon("sales_rank_current")}
          {rh("salesRank")}
        </th>
        <th style={w("buyBox")} onClick={() => onSort("buybox_price")}>
          Buy Box{sortIcon("buybox_price")}
          {rh("buyBox")}
        </th>
        <th style={w("rating")} onClick={() => onSort("rating")}>
          Rating{sortIcon("rating")}
          {rh("rating")}
        </th>
        <th style={w("status")} onClick={() => onSort("seller_status")}>
          Status{sortIcon("seller_status")}
          {rh("status")}
        </th>
        <th style={w("score")} onClick={() => onSort("score")}>
          Score{sortIcon("score")}
          {rh("score")}
        </th>
        <th style={w("tags")}>
          Tags
          {rh("tags")}
        </th>
        <th style={w("notes")}>
          Notes
          {rh("notes")}
        </th>
        <th style={w("checkedAt")} onClick={() => onSort("checked_at")}>
          Checked At{sortIcon("checked_at")}
          {rh("checkedAt")}
        </th>
      </tr>
    </thead>
  );
});