interface ImportSummaryResult {
  message: string;
  summary: {
    importFileId: number;
    total_rows: number;
    inserted_rows: number;
    updated_rows: number;
    failed_rows: number;
    hasErrors: boolean;
    errors: Array<{ row: number; reason: string }>;
  };
}

interface Props {
  result: ImportSummaryResult;
  onClose: () => void;
}

export function ImportSummaryModal({ result, onClose }: Props) {
  const { summary } = result;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">📊 Import Summary</div>

        <div className="summary-box mb-4">
          <div className="summary-row">
            <span>Total rows in file</span>
            <strong>{summary.total_rows.toLocaleString()}</strong>
          </div>
          <div className="summary-row" style={{ color: "#22c55e" }}>
            <span>✅ Added</span>
            <strong>{summary.inserted_rows.toLocaleString()}</strong>
          </div>
          <div className="summary-row" style={{ color: "#3b82f6" }}>
            <span>🔄 Updated</span>
            <strong>{summary.updated_rows.toLocaleString()}</strong>
          </div>
          <div className="summary-row" style={{ color: summary.failed_rows > 0 ? "#ef4444" : undefined }}>
            <span>❌ Failed</span>
            <strong>{summary.failed_rows.toLocaleString()}</strong>
          </div>
        </div>

        {summary.errors.length > 0 && (
          <>
            <div className="card-title" style={{ marginBottom: 8 }}>
              Errors (showing first {summary.errors.length})
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
              {summary.errors.map((err, i) => (
                <div key={i} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <strong>Row {err.row}:</strong>{" "}
                  <span style={{ color: "#ef4444" }}>{err.reason}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
