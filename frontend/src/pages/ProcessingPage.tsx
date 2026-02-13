import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { processingApi } from "../api";
import type { ProcessingStatus } from "../types";

type ProcessingMode = "100" | "200" | "unchecked";

const MODES: { value: ProcessingMode; label: string; description: string }[] = [
  { value: "100", label: "100 ASINs", description: "Process 100 most recently added ASINs" },
  { value: "200", label: "200 ASINs", description: "Process 200 most recently added ASINs" },
  { value: "unchecked", label: "All Unchecked", description: "All ASINs with no check result yet" },
];

export function ProcessingPage() {
  const qc = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<ProcessingMode>("100");
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // Poll active job status every 2 seconds when running
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["processing-status"],
    queryFn: processingApi.getActiveStatus,
    refetchInterval: pollingEnabled ? 2000 : false,
  });

  useEffect(() => {
    if (status?.status === "running") {
      setPollingEnabled(true);
    } else if (status?.status === "completed" || status?.status === "failed" || status?.status === "idle") {
      setPollingEnabled(false);
      if (status?.status === "completed") {
        qc.invalidateQueries({ queryKey: ["products"] });
      }
    }
  }, [status?.status, qc]);

  const startMutation = useMutation({
    mutationFn: (mode: ProcessingMode) => processingApi.start(mode),
    onSuccess: () => {
      setPollingEnabled(true);
      qc.invalidateQueries({ queryKey: ["processing-status"] });
    },
  });

  const isRunning = status?.status === "running";
  const isIdle = !status || status.status === "idle";

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ASIN Processing</h1>
      </div>

      {/* Mode selection */}
      <div className="card">
        <div className="card-title">Select Processing Mode</div>
        <div className="flex gap-3 mb-4">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`btn ${selectedMode === m.value ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSelectedMode(m.value)}
              disabled={isRunning}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          {MODES.find((m) => m.value === selectedMode)?.description}
        </p>
        <button
          className="btn btn-success"
          onClick={() => startMutation.mutate(selectedMode)}
          disabled={isRunning || startMutation.isPending}
          style={{ minWidth: 160 }}
        >
          {startMutation.isPending ? (
            <><span className="spinner" /> Starting...</>
          ) : isRunning ? (
            "⏳ Running..."
          ) : (
            "▶ Start Processing"
          )}
        </button>
        {startMutation.isError && (
          <p className="error-text">{(startMutation.error as Error).message}</p>
        )}
      </div>

      {/* Status panel */}
      {!isIdle && (
        <div className="card">
          <div className="card-title">
            {status?.status === "running" && "⚡ Processing in Progress"}
            {status?.status === "completed" && "✅ Processing Completed"}
            {status?.status === "failed" && "❌ Processing Failed"}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {status?.processed ?? 0} / {status?.total ?? 0} ASINs processed
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                {status?.percentage ?? 0}%
              </span>
            </div>
            <div className="progress-bar-wrap">
              <div
                className={`progress-bar-fill ${status?.status === "completed" ? "complete" : ""}`}
                style={{ width: `${status?.percentage ?? 0}%` }}
              />
            </div>
          </div>

          <div className="summary-box">
            {status?.jobId && (
              <div className="summary-row">
                <span className="text-muted">Job ID</span>
                <strong style={{ fontSize: 11, fontFamily: "monospace" }}>{status.jobId.slice(0, 8)}…</strong>
              </div>
            )}
            {status?.startedAt && (
              <div className="summary-row">
                <span className="text-muted">Started</span>
                <strong>{new Date(status.startedAt).toLocaleTimeString()}</strong>
              </div>
            )}
            {status?.completedAt && (
              <div className="summary-row">
                <span className="text-muted">Completed</span>
                <strong>{new Date(status.completedAt).toLocaleTimeString()}</strong>
              </div>
            )}
            {status?.error && (
              <div className="summary-row">
                <span className="text-muted">Error</span>
                <strong style={{ color: "#ef4444" }}>{status.error}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="card">
        <div className="card-title">How it works</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7 }}>
          <p>Processing runs as a <strong>background job</strong> via BullMQ queue – not in your browser.</p>
          <p>Each ASIN is checked against the <strong>Amazon Selling Partner API</strong> for seller eligibility.</p>
          <p>The system automatically handles <strong>rate limits</strong> with retry + exponential backoff.</p>
          <p>Failed ASINs are skipped (not marked as checked) and can be retried in a future run.</p>
        </div>
      </div>
    </div>
  );
}
