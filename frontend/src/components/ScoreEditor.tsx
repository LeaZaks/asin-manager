import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { evaluationsApi } from "../api";

interface ScoreEditorProps {
  asin: string;
  currentScore: number | null;
}

export function ScoreEditor({ asin, currentScore }: ScoreEditorProps) {
  const qc = useQueryClient();
  const [hovered, setHovered] = useState(0);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (score: number) => evaluationsApi.upsert(asin, score),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1000);
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const displayScore = hovered || currentScore || 0;
  const color = displayScore <= 2 ? "#ef4444" : displayScore === 3 ? "#f59e0b" : "#22c55e";

  return (
    <div className="score-editor" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          style={{
            cursor: "pointer",
            fontSize: 15,
            color: s <= displayScore ? color : "#e2e8f0",
            transition: "color .1s",
          }}
          onMouseEnter={() => setHovered(s)}
          onClick={() => mutation.mutate(s)}
          title={`Set score to ${s}`}
        >
          ★
        </span>
      ))}      
      
      <span className={`score-save-indicator ${saved ? "visible" : ""}`}>✓</span>
      
      </div>
  );
}
