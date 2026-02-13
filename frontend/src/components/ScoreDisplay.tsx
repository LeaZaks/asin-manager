interface ScoreDisplayProps {
  score: number | null;
}

export function ScoreDisplay({ score }: ScoreDisplayProps) {
  if (!score) return <span className="text-muted">—</span>;
  const color = score <= 2 ? "#ef4444" : score === 3 ? "#f59e0b" : "#22c55e";
  const stars = "★".repeat(score) + "☆".repeat(5 - score);
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13, letterSpacing: 1 }} title={`Score: ${score}/5`}>
      {stars}
    </span>
  );
}
