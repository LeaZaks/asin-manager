import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useImportToast } from "../contexts/ImportToastContext";

interface ImportProgress {
  jobId: string;
  status: "processing" | "completed" | "failed";
  total: number;
  processed: number;
  startedAt: string;
  completedAt?: string;
}

async function fetchProgress(jobId: string): Promise<ImportProgress> {
  const res = await fetch(`http://localhost:3001/api/import/progress/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch progress");
  return res.json();
}

export function ImportToast() {
  const { currentJobId, clearImport } = useImportToast();
  const [showSummary, setShowSummary] = useState(false);

  // Poll for progress every 500ms when there's an active job
  const { data: progress } = useQuery({
    queryKey: ["import-progress", currentJobId],
    queryFn: () => fetchProgress(currentJobId!),
    enabled: !!currentJobId && !showSummary,
    refetchInterval: 500, // Poll every 500ms
  });

  // When import completes, show summary for 3 seconds then auto-dismiss
  useEffect(() => {
    if (progress?.status === "completed") {
      setShowSummary(true);
      const timer = setTimeout(() => {
        clearImport();
        setShowSummary(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [progress?.status, clearImport]);

  if (!currentJobId || !progress) return null;

  const percentage = progress.total > 0 
    ? Math.round((progress.processed / progress.total) * 100) 
    : 0;

  // Show completed state
  if (progress.status === "completed") {
    return (
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        background: '#22c55e',
        color: 'white',
        padding: '20px 24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(34, 197, 94, 0.4)',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        minWidth: '280px',
        zIndex: 1000,
        animation: 'slideIn 0.3s ease-out'
      }}>
        <span style={{ fontSize: '20px' }}>✅</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            Import Complete!
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
            {progress.processed} ASINs processed
          </div>
        </div>
      </div>
    );
  }

  // Show processing state
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      background: 'white',
      padding: '20px 24px',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minWidth: '300px',
      zIndex: 1000,
      animation: 'slideIn 0.3s ease-out',
      border: '1px solid #e2e8f0'
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
            📤 Importing CSV
          </div>
          <div style={{ fontSize: '13px', color: '#3b82f6', marginTop: '4px', fontWeight: 500 }}>
            {progress.processed} / {progress.total} ASINs ({percentage}%)
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div style={{ 
        height: '6px', 
        background: '#e2e8f0', 
        borderRadius: '3px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          height: '100%', 
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          width: `${percentage}%`,
          transition: 'width 0.3s ease-out'
        }} />
      </div>
    </div>
  );
}
