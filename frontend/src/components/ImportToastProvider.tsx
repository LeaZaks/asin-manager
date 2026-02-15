import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, Loader2, X } from "lucide-react";

interface ImportSummary {
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
}

interface ToastState {
  type: "importing" | "success" | "error";
  filename?: string;
  summary?: ImportSummary;
  errorMessage?: string;
}

interface ImportToastContextValue {
  showImporting: (filename: string) => void;
  showSuccess: (summary: ImportSummary) => void;
  showError: (message: string) => void;
  dismiss: () => void;
}

const ImportToastContext = createContext<ImportToastContextValue | null>(null);

export function useImportToast() {
  const ctx = useContext(ImportToastContext);
  if (!ctx) throw new Error("useImportToast must be used within ImportToastProvider");
  return ctx;
}

export function ImportToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => setToast(null), []);

  const showImporting = useCallback((filename: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ type: "importing", filename });
  }, []);

  const showSuccess = useCallback((summary: ImportSummary) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ type: "success", summary });
    timerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const showError = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ type: "error", errorMessage: message });
    timerRef.current = setTimeout(() => setToast(null), 8000);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <ImportToastContext.Provider value={{ showImporting, showSuccess, showError, dismiss }}>
      {children}
      {toast && <Toast toast={toast} onDismiss={dismiss} />}
    </ImportToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  if (toast.type === "importing") {
    return (
      <div className="global-toast global-toast-importing">
        <div className="global-toast-header">
          <div className="global-toast-icon-wrap importing">
            <Loader2 size={18} className="global-toast-spinner" />
          </div>
          <div className="global-toast-content">
            <div className="global-toast-title">Importing CSV</div>
            <div className="global-toast-subtitle">
              {toast.filename ? `Processing ${toast.filename}...` : "Processing your file..."}
            </div>
          </div>
        </div>
        <div className="global-toast-progress-track">
          <div className="global-toast-progress-bar" />
        </div>
      </div>
    );
  }

  if (toast.type === "success") {
    const s = toast.summary;
    return (
      <div className="global-toast global-toast-success">
        <div className="global-toast-header">
          <div className="global-toast-icon-wrap success">
            <CheckCircle size={18} />
          </div>
          <div className="global-toast-content">
            <div className="global-toast-title">Import Complete</div>
            {s && (
              <div className="global-toast-subtitle">
                {s.inserted_rows > 0 && <span>{s.inserted_rows} added</span>}
                {s.updated_rows > 0 && <span>{s.inserted_rows > 0 ? ", " : ""}{s.updated_rows} updated</span>}
                {s.failed_rows > 0 && <span className="global-toast-fail-count">{s.failed_rows} failed</span>}
              </div>
            )}
          </div>
          <button className="global-toast-close" onClick={onDismiss}>
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (toast.type === "error") {
    return (
      <div className="global-toast global-toast-error">
        <div className="global-toast-header">
          <div className="global-toast-icon-wrap error">
            <AlertCircle size={18} />
          </div>
          <div className="global-toast-content">
            <div className="global-toast-title">Import Failed</div>
            <div className="global-toast-subtitle">{toast.errorMessage}</div>
          </div>
          <button className="global-toast-close" onClick={onDismiss}>
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
