import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api";

interface NotesEditorProps {
  asin: string;
  currentNotes: string | null;
}

export function NotesEditor({ asin, currentNotes }: NotesEditorProps) {
  const qc = useQueryClient();
  const [value, setValue] = useState(currentNotes ?? "");
  const [isEditing, setIsEditing] = useState(false);

  const mutation = useMutation({
    mutationFn: (notes: string | null) => productsApi.updateNotes(asin, notes),
    onSuccess: (updatedProduct) => {
      setValue(updatedProduct.notes ?? "");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
  
  useEffect(() => {
       if (!isEditing && !mutation.isPending) {
         setValue(currentNotes ?? "");
       }
     }, [currentNotes, isEditing, mutation.isPending]);



  const save = () => {
    const normalized = value.trim();
    const nextValue = normalized || null;
    const previousValue = currentNotes?.trim() || null;

    if (nextValue === previousValue) {
      setIsEditing(false);
      return;
    }

    if (mutation.isPending) return;
    mutation.mutate(nextValue);
  };

  return (
    <div className="notes-editor-wrap">
      <input
        className={`notes-input ${mutation.isPending ? "is-saving" : ""}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setIsEditing(true)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setValue(currentNotes ?? "");
            setIsEditing(false);
            e.currentTarget.blur();
          }
        }}
        placeholder="Add note..."
        aria-label={`Notes for ${asin}`}
        maxLength={500}
      />
    </div>
  );
}