import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Square, Volume2, VolumeX } from "lucide-react";
import { processingApi } from "../api";
import type { ProcessingStatus } from "../types";

type ProcessingMode = "100" | "200" | "unchecked" | "gated";

const MODES: { value: ProcessingMode; label: string; description: string }[] = [
  { value: "unchecked", label: "All Unchecked", description: "Check all ASINs that haven't been checked yet" },
  { value: "gated", label: "Re-check Gated", description: "Re-check all ASINs currently marked as Gated" },
];

/** Play a short positive chime via Web Audio API */
function playApprovalSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Two-note chime: C5 → E5
    const notes = [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });

    // Close context after sounds finish
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available — silently ignore
  }
}

export function ProcessingPage() {
  const qc = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<ProcessingMode>("unchecked");
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevAllowedRef = useRef<number>(-1);

  // Poll active job status every 2 seconds when running
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["processing-status"],
    queryFn: processingApi.getActiveStatus,
    refetchInterval: pollingEnabled ? 2000 : false,
  });

  // Play sound when new "allowed" ASINs appear
  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    playApprovalSound();
  }, [soundEnabled]);

  useEffect(() => {
    if (status?.status === "running" && status?.summary) {
      const currentAllowed = status.summary.allowed || 0;
      // Skip sound on first poll (initialization), play on subsequent increases
      if (prevAllowedRef.current >= 0 && currentAllowed > prevAllowedRef.current) {
        playSound();
      }
      prevAllowedRef.current = currentAllowed;
    }
  }, [status?.summary?.allowed, status?.status, playSound]);

  useEffect(() => {
    if (status?.status === "running" && status.total > 0) {
      setPollingEnabled(true);
    } else if (status?.status === "completed" || status?.status === "failed" || status?.status === "idle") {
      setPollingEnabled(false);
      if (status?.status === "completed") {
        qc.invalidateQueries({ queryKey: ["products"] });
      }
    } else if (status?.status === "running" && status.total === 0) {
      setPollingEnabled(false);
    }
  }, [status?.status, status?.total, qc]);

  // Reset allowed counter when starting a new job
  const startMutation = useMutation({
    mutationFn: (mode: ProcessingMode) => processingApi.start(mode),
    onSuccess: () => {
      prevAllowedRef.current = 0;
      setPollingEnabled(true);
      qc.invalidateQueries({ queryKey: ["processing-status"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => processingApi.cancel(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["processing-status"] });
    },
  });

  const isRunning = status?.status === "running" && status.total > 0;
  const isIdle = !status || status.status === "idle" || (status.status === "running" && status.total === 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ASIN Processing</h1>
        <button
          className={`btn ${soundEnabled ? "btn-secondary" : "btn-secondary"}`}
          onClick={() => setSoundEnabled((v) => !v)}
          title={soundEnabled ? "Sound notifications ON" : "Sound notifications OFF"}
          style={{ gap: 6 }}
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {soundEnabled ? "Sound ON" : "Sound OFF"}
        </button>
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
        <div className="flex gap-2">
          <button
            className="btn btn-success"
            onClick={() => startMutation.mutate(selectedMode)}
            disabled={isRunning || startMutation.isPending}
            style={{ minWidth: 160 }}
          >
            {startMutation.isPending ? (
              <><span className="spinner" /> Starting...</>
            ) : isRunning ? (
              "Running..."
            ) : (
              "Start Processing"
            )}
          </button>
          {isRunning && (
            <button
              className="btn-stop"
              onClick={() => {
                if (confirm("Are you sure you want to stop the processing? ASINs already processed will keep their results.")) {
                  cancelMutation.mutate();
                }
              }}
              disabled={cancelMutation.isPending}
            >
              <Square size={14} />
              {cancelMutation.isPending ? "Stopping..." : "Stop Processing"}
            </button>
          )}
        </div>
        {startMutation.isError && (
          <p className="error-text">{(startMutation.error as Error).message}</p>
        )}
        {cancelMutation.isError && (
          <p className="error-text">{(cancelMutation.error as Error).message}</p>
        )}
      </div>

      {/* Status panel */}
      {!isIdle && status?.total > 0 && (
        <div className="card">
          <div className="card-title">
            {status?.status === "running" && "Processing in Progress"}
            {status?.status === "completed" && "Processing Completed"}
            {status?.status === "failed" && "Processing Failed"}
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
                <strong style={{ fontSize: 11, fontFamily: "monospace" }}>{status.jobId.slice(0, 8)}...</strong>
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

      {/* Real-time Summary Section - shown during running and after completion */}
      {(status?.status === 'running' || status?.status === 'completed') && status?.summary && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {status.status === 'completed' ? 'Processing Summary' : 'Live Summary'}
          </h2>
          <div style={{ marginTop: '1rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}>
              <div className="summary-stat-card" style={{
                padding: '1rem',
                background: '#f0f9ff',
                borderRadius: '10px',
                border: '1px solid #bae6fd'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#0369a1', marginBottom: '0.25rem' }}>
                  Total Processed
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0c4a6e' }}>
                  {status.processed}
                </div>
              </div>

              <div className="summary-stat-card" style={{
                padding: '1rem',
                background: '#f0fdf4',
                borderRadius: '10px',
                border: '1px solid #86efac',
                transition: 'transform 0.2s',
              }}>
                <div style={{ fontSize: '0.8rem', color: '#15803d', marginBottom: '0.25rem' }}>
                  Allowed
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#166534' }}>
                  {status.summary.allowed || 0}
                </div>
              </div>

              <div className="summary-stat-card" style={{
                padding: '1rem',
                background: '#fefce8',
                borderRadius: '10px',
                border: '1px solid #fde047'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#a16207', marginBottom: '0.25rem' }}>
                  Gated
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#854d0e' }}>
                  {status.summary.gated || 0}
                </div>
              </div>

              <div className="summary-stat-card" style={{
                padding: '1rem',
                background: '#fef2f2',
                borderRadius: '10px',
                border: '1px solid #fca5a5'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginBottom: '0.25rem' }}>
                  Restricted
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#991b1b' }}>
                  {status.summary.restricted || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How it works - shown when idle */}
      {isIdle && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0' }}>How it works</h2>
          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            <p>
              Processing runs as a <strong>background job</strong> via BullMQ queue – not in your browser.
            </p>
            <p>
              Each ASIN is checked against the <strong>Amazon Selling Partner API</strong> for seller eligibility.
            </p>
            <p>
              The system automatically handles <strong>rate limits</strong> with retry + exponential backoff.
            </p>
            <p>
              Failed ASINs are skipped (not marked as checked) and can be retried in a future run.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
