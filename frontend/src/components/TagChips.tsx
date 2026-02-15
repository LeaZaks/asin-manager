import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "../api";
import type { Tag, ProductTag } from "../types";

interface TagChipsProps {
  asin: string;
  productTags: ProductTag[];
  allTags: Tag[];
  showAll?: boolean; // detail page: show full UI
  compact?: boolean;
}

export function TagChips({ asin, productTags, allTags, showAll = false, compact = false }: TagChipsProps) {
    const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);

  const addMutation = useMutation({
    mutationFn: (tagId: number) => tagsApi.addToProduct(asin, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", asin] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tagId: number) => tagsApi.removeFromProduct(asin, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", asin] });
    },
  });

  const assignedTagIds = new Set(productTags.map((pt) => pt.tag_id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id));

  return (
    <div className={`tag-chips-row ${compact ? "compact" : ""}`}>
      {productTags.map((pt) => (
        <span
          key={pt.id}
          className={`tag-chip ${pt.tag.type === "warning" ? "tag-chip-warning" : ""}`}
        >
          {pt.tag.type === "warning" ? "⚠️" : "📝"} {pt.tag.name}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeMutation.mutate(pt.tag_id);
            }}
            title="Remove tag"
            aria-label="Remove tag"
          >
            ×
          </button>
        </span>
      ))}

      {/* Add tag button */}
      {availableTags.length > 0 || showAll ? (
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary"
            style={{ padding: "2px 7px", fontSize: 11 }}
            onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
          >
            + Tag
          </button>
          {showPicker && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                zIndex: 50,
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                minWidth: 180,
                padding: 8,
              }}
            >
              {availableTags.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8", padding: "4px 8px" }}>
                  All tags assigned. Manage tags in the Tags page.
                </p>
              ) : (
                availableTags.map((tag) => (
                  <div
                    key={tag.id}
                    style={{ padding: "5px 10px", cursor: "pointer", borderRadius: 5, fontSize: 12 }}
                    className="tag-pick-item"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    onClick={() => {
                      addMutation.mutate(tag.id);
                      setShowPicker(false);
                    }}
                  >
                    {tag.type === "warning" ? "⚠️" : "📝"} {tag.name}
                  </div>
                ))
              )}
              <div
                style={{ padding: "5px 10px", cursor: "pointer", borderRadius: 5, fontSize: 11, color: "#94a3b8", borderTop: "1px solid #f1f5f9", marginTop: 4 }}
                onClick={() => setShowPicker(false)}
              >
                Close
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
