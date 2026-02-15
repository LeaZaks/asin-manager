import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { productsApi, importApi, tagsApi } from "../api";
import type { Product, Tag } from "../types";
import { ScoreEditor } from "../components/ScoreEditor";
import { TagChips } from "../components/TagChips";
import { ImportSummaryModal } from "../components/ImportSummaryModal";

const STATUS_OPTIONS = ["", "allowed", "gated", "requires_invoice", "restricted", "unknown"];
const SORT_FIELDS = [
  { value: "created_at", label: "Date Added" },
  { value: "asin", label: "ASIN" },
  { value: "brand", label: "Brand" },
  { value: "sales_rank_current", label: "Sales Rank" },
  { value: "buybox_price", label: "Buy Box Price" },
  { value: "rating", label: "Rating" },
];

const PAGE_SIZE_OPTIONS = [100, 200, 500] as const;

const AMAZON_CLICKED_KEY = "clickedAmazonAsins";

function getAmazonUrl(product: Product) {
  return product.amazon_url?.trim() || `https://www.amazon.com/dp/${product.asin}?psc=1`;
}

function getSessionClickedAsins() {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(AMAZON_CLICKED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}


export function ProductsPage() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(100);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clickedAmazonAsins, setClickedAmazonAsins] = useState<Set<string>>(() => new Set(getSessionClickedAsins()));

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualAsin, setManualAsin] = useState("");
  const [importResult, setImportResult] = useState<null | object>(null);
  const [importError, setImportError] = useState("");
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["products", { page, pageSize, search, brand, status, sortBy, sortOrder }],
    queryFn: () => productsApi.list({ page, limit: pageSize, search, brand, status, sortBy, sortOrder 
    }),
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  // Refetch products when entering the page (e.g., coming back from Processing)
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["products"] });
  }, []);

  // Poll import progress while a job is running
  useEffect(() => {
    if (!importJobId) return;
    const interval = setInterval(async () => {
      try {
        const p = await importApi.getProgress(importJobId);
        setImportProgress({ processed: p.processed, total: p.total });
        if (p.status === "completed") {
          clearInterval(interval);
          setImportJobId(null);
          if (p.summary) {
            setImportResult({ message: "Import completed", summary: p.summary });
          }
          qc.invalidateQueries({ queryKey: ["products"] });
        } else if (p.status === "failed") {
          clearInterval(interval);
          setImportJobId(null);
          setImportError("Import failed unexpectedly");
        }
      } catch {
        clearInterval(interval);
        setImportJobId(null);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [importJobId]);

  const deleteMutation = useMutation({
    mutationFn: (asins: string[]) => productsApi.deleteMany(asins),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const csvMutation = useMutation({
    mutationFn: (file: File) => importApi.uploadCSV(file),
    onSuccess: (data) => {
      // Server returns immediately with jobId — start polling for real progress
      setImportProgress({ processed: 0, total: data.total });
      setImportJobId(data.jobId);
    },
    onError: (err: Error) => setImportError(err.message),
  });

  const manualMutation = useMutation({
    mutationFn: () => importApi.addManual(manualAsin.trim()),
    onSuccess: () => {
      setManualAsin("");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => setImportError(err.message),
  });

  function toggleSelect(asin: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin); else next.add(asin);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((p) => p.asin)));
    }
  }

  function markAmazonClicked(asin: string) {
    setClickedAmazonAsins((prev) => {
      if (prev.has(asin)) return prev;
      const next = new Set(prev);
      next.add(asin);
      sessionStorage.setItem(AMAZON_CLICKED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }


  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  }

  const sortIcon = (field: string) => {
    if (sortBy !== field) return " ↕";
    return sortOrder === "asc" ? " ↑" : " ↓";
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Products</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              setImportError("");
              const f = e.target.files?.[0];
              if (f) csvMutation.mutate(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={csvMutation.isPending || !!importJobId}>
            {(csvMutation.isPending || importJobId) ? <><span className="spinner" /> Importing...</> : "📤 Import CSV"}
          </button>
        </div>
      </div>

      {/* Manual ASIN input */}
      <div className="card mb-4">
        <div className="card-title">Add Single ASIN</div>
        <div className="flex gap-2" style={{ maxWidth: 400 }}>
          <input
            className="input"
            placeholder="Enter ASIN (e.g. B08N5LNQCX)"
            value={manualAsin}
            onChange={(e) => setManualAsin(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && manualAsin.trim().length === 10 && manualMutation.mutate()}
            maxLength={10}
          />
          <button
            className="btn btn-primary"
            onClick={() => manualMutation.mutate()}
            disabled={manualAsin.trim().length !== 10 || manualMutation.isPending}
          >
            {manualMutation.isPending ? <span className="spinner" /> : "Add"}
          </button>
        </div>
        {importError && <p className="error-text">{importError}</p>}
        {manualMutation.isSuccess && !manualMutation.isPending && (
          <p className="success-text" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            ✓ ASIN added successfully
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="filters-row">
        <input className="input" placeholder="🔍 Search ASIN or Brand..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <input className="input" placeholder="Filter by brand..." value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} />
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || "All Statuses"}</option>
          ))}
        </select>
        <select className="select" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          {SORT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setSortOrder((o) => o === "asc" ? "desc" : "asc")}>
          {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
        {selected.size > 0 && (
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(`Delete ${selected.size} selected ASINs?`)) {
                deleteMutation.mutate(Array.from(selected));
              }
            }}
            disabled={deleteMutation.isPending}
          >
            🗑 Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" className="checkbox" onChange={toggleSelectAll} checked={!!data && selected.size === data.items.length && data.items.length > 0} /></th>
              <th className="asin-column" onClick={() => handleSort("asin")}>ASIN{sortIcon("asin")}</th>
              <th onClick={() => handleSort("brand")}>Brand{sortIcon("brand")}</th>
              <th onClick={() => handleSort("sales_rank_current")}>Sales Rank{sortIcon("sales_rank_current")}</th>
              <th onClick={() => handleSort("buybox_price")}>Buy Box{sortIcon("buybox_price")}</th>
              <th onClick={() => handleSort("rating")}>Rating{sortIcon("rating")}</th>
              <th>Status</th>
              <th className="score-column">Score</th>
              <th className="tags-column">Tags</th>
              <th>Checked At</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></td></tr>
            )}
            {data?.items.map((product: Product) => (
              <tr key={product.asin} className={selected.has(product.asin) ? "tr-selected" : ""}>
                <td><input type="checkbox" className="checkbox" checked={selected.has(product.asin)} onChange={() => toggleSelect(product.asin)} /></td>
                <td className="asin-column">
                  <span className="asin-cell-content">
                    <Link to={`/products/${product.asin}`} className="asin-link">{product.asin}</Link>
                    <a
                      href={getAmazonUrl(product)}
                      className={`amazon-link-icon ${clickedAmazonAsins.has(product.asin) ? "is-clicked" : ""}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${product.asin} on Amazon`}
                      title={clickedAmazonAsins.has(product.asin) ? "Amazon link opened in this session" : "Open on Amazon"}
                      onClick={() => markAmazonClicked(product.asin)}
                    >
                      ↗
                      <ExternalLink size={11} strokeWidth={2.25} />
                    </a>
                  </span>
                </td>
                <td>{product.brand ?? <span className="text-muted">—</span>}</td>
                <td>{product.sales_rank_current?.toLocaleString() ?? <span className="text-muted">—</span>}</td>
                <td>{product.buybox_price != null ? `$${product.buybox_price.toFixed(2)}` : <span className="text-muted">—</span>}</td>
                <td>{product.rating != null ? `⭐ ${product.rating}` : <span className="text-muted">—</span>}</td>
                <td><StatusBadge status={product.sellerStatus?.status} /></td>
                <td className="score-column">
                   <ScoreEditor asin={product.asin} currentScore={product.evaluation?.score ?? null} />
                </td>
                <td className="tags-column">
                <TagChips
                    asin={product.asin}
                    productTags={product.productTags}
                    allTags={allTags}
                  />
                </td>
                <td>{product.sellerStatus?.checked_at ? new Date(product.sellerStatus.checked_at).toLocaleDateString() : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No products found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">
          {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.total)} of {data.total.toLocaleString()} products          
          </span>
          <label className="pagination-limit-control">
            <span>Rows</span>
            <select
              className="select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                setPage(1);
                setSelected(new Set());
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13 }}>Page {page} / {data.totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
      {data && data.totalPages <= 1 && data.total > 0 && (
        <div className="pagination">
          <span className="pagination-info">{data.total.toLocaleString()} products</span>
        </div>
      )}

      {/* Import Summary Modal - only after completion */}
      {importResult && !importJobId && (
        <ImportSummaryModal
          result={importResult as Parameters<typeof ImportSummaryModal>[0]["result"]}
          isLoading={false}
          onClose={() => {
            setImportResult(null);
            setImportProgress(null);
            csvMutation.reset();
          }}
        />
      )}

      {/* Toast during CSV import — shows real progress */}
      {(csvMutation.isPending || importJobId) && (
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
          minWidth: '280px',
          zIndex: 1000,
          animation: 'slideIn 0.3s ease-out',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
                Importing CSV
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {importProgress && importProgress.total > 0
                  ? `${importProgress.processed.toLocaleString()} / ${importProgress.total.toLocaleString()} records`
                  : "Uploading file..."}
              </div>
            </div>
            {importProgress && importProgress.total > 0 && (
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>
                {Math.round((importProgress.processed / importProgress.total) * 100)}%
              </div>
            )}
          </div>
          <div style={{
            height: '4px',
            background: '#e2e8f0',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
              width: importProgress && importProgress.total > 0
                ? `${Math.round((importProgress.processed / importProgress.total) * 100)}%`
                : '100%',
              ...((!importProgress || importProgress.total === 0) ? { animation: 'progress 1.5s ease-in-out infinite' } : {}),
            }} />
          </div>
        </div>
      )}

      {/* Toast for manual ASIN success */}
      {manualMutation.isSuccess && !manualMutation.isPending && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: '#22c55e',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(34, 197, 94, 0.4)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          fontSize: '14px',
          fontWeight: 500,
          zIndex: 1000,
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span>✅</span>
          <span>ASIN added successfully!</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="badge badge-unknown">—</span>;
  return <span className={`badge badge-${status}`}>{status.replace("_", " ")}</span>;
}