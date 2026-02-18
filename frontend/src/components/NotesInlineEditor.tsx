import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api";
import { PRODUCT_NOTES_MAX_LENGTH } from "../constants/products";

interface NotesInlineEditorProps {
  asin: string;
  currentNotes: string | null;
}

export function NotesInlineEditor({ asin, currentNotes }: NotesInlineEditorProps) {
  const qc = useQueryClient();
  const [value, setValue] = useState(currentNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentNotes ?? "");
    setError(null);
  }, [currentNotes]);

  const mutation = useMutation({
    mutationFn: (notes: string | null) => productsApi.updateNotes(asin, notes),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", asin] });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to save");
    },
  });

  function saveIfChanged() {
    if (mutation.isPending) return;
    const normalized = value.trim();
    const original = (currentNotes ?? "").trim();
    if (normalized === original) return;
    mutation.mutate(normalized || null);
  }

  return (
    <div className="notes-inline-editor">
      <input
        className="notes-inline-input"
        value={value}
        placeholder="Add note..."
        maxLength={PRODUCT_NOTES_MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onBlur={saveIfChanged}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={mutation.isPending}
        title={mutation.isPending ? "Saving..." : "Press Enter to save"}
      />
      <span className="notes-inline-count">{value.length}/{PRODUCT_NOTES_MAX_LENGTH}</span>
      {error && <span className="notes-inline-error">{error}</span>}
    </div>
  );
}
