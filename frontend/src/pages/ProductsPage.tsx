import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { productsApi, importApi } from "../api";
import type { Product } from "../types";
import { ScoreEditor } from "../components/ScoreEditor";
import { NotesInlineEditor } from "../components/NotesInlineEditor";
import { ImportSummaryModal } from "../components/ImportSummaryModal";
import { useImportToast } from "../components/ImportToastProvider";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "allowed", label: "Allowed", color: "#22c55e" },
  { value: "gated", label: "Gated", color: "#eab308" },
  { value: "requires_invoice", label: "Requires Invoice", color: "#f97316" },
  { value: "restricted", label: "Restricted", color: "#ef4444" },
  { value: "unknown", label: "Unknown", color: "#94a3b8" },
];

const SORT_FIELDS = [
  { value: "created_at", label: "Date Added" },
  { value: "asin", label: "ASIN" },
  { value: "brand", label: "Brand" },
  { value: "sales_rank_current", label: "Sales Rank" },
  { value: "buybox_price", label: "Buy Box Price" },
  { value: "rating", label: "Rating" },
  { value: "seller_status", label: "Status" },
  { value: "checked_at", label: "Checked At" },
];

const CHECKED_OPTIONS = [
  { value: "", label: "All" },
  { value: "not_null", label: "Checked" },
  { value: "null", label: "Not Checked" },
];

const PAGE_SIZE_OPTIONS = [100, 200, 500, 1000, 2000, 5000] as const;

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
  const { showImporting, showSuccess, showError } = useImportToast();

  // Filters
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [checkedAt, setCheckedAt] = useState<"" | "null" | "not_null">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(100);
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clickedAmazonAsins, setClickedAmazonAsins] = useState<Set<string>>(() => new Set(getSessionClickedAsins()));

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<null | { message: string; summary: { importFileId: number; total_rows: number; inserted_rows: number; updated_rows: number; failed_rows: number; hasErrors: boolean; errors: Array<{ row: number; reason: string }> } }>(null);

  const activeFilterCount = [brand, status, checkedAt].filter(Boolean).length;

  const { data, isLoading } = useQuery({
    queryKey: ["products", { page, pageSize, search, brand, status, checkedAt, sortBy, sortOrder }],
    queryFn: () => productsApi.list({ page, limit: pageSize, search, brand, status, checkedAt: checkedAt || undefined, sortBy, sortOrder }),
  });

  // 🔥 Refetch products when entering the page (e.g., coming back from Processing)
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["products"] });
  }, []); // Only run once when component mounts

  const deleteMutation = useMutation({
    mutationFn: (asins: string[]) => productsApi.deleteMany(asins),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const csvMutation = useMutation({
    mutationFn: (file: File) => {
      showImporting(file.name);
      return importApi.uploadCSV(file);
    },
    onSuccess: (data) => {
      setImportJobId(data.jobId);
    },
    onError: (err: Error) => {
      showError(err.message);
    },
  });

  // Poll for import progress when we have a jobId
  const { data: importProgress } = useQuery({
    queryKey: ["import-progress", importJobId],
    queryFn: () => importApi.getProgress(importJobId!),
    enabled: !!importJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 500;
    },
  });

  // When import completes or fails, update UI
  const prevProgressStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!importProgress || prevProgressStatus.current === importProgress.status) return;
    if (importProgress.status === "completed") {
      prevProgressStatus.current = importProgress.status;
      const summary = importProgress.summary;
      if (summary) {
        showSuccess({
          total_rows: summary.total_rows,
          inserted_rows: summary.inserted_rows,
          updated_rows: summary.updated_rows,
          failed_rows: summary.failed_rows,
        });
        setImportResult({
          message: "Import complete",
          summary,
        });
      } else {
        showSuccess({
          total_rows: importProgress.total,
          inserted_rows: importProgress.processed,
          updated_rows: 0,
          failed_rows: 0,
        });
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      setImportJobId(null);
    } else if (importProgress.status === "failed") {
      prevProgressStatus.current = importProgress.status;
      showError("Import failed");
      setImportJobId(null);
    }
  }, [importProgress?.status]);

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

  function clearFilters() {
    setSearch("");
    setBrand("");
    setStatus("");
    setCheckedAt("");
    setSortBy("created_at");
    setSortOrder("desc");
    setPage(1);
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
              const f = e.target.files?.[0];
              if (f) csvMutation.mutate(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={csvMutation.isPending}>
            {csvMutation.isPending ? <><span className="spinner" /> Importing...</> : "Import CSV"}
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="toolbar">
        <div className="toolbar-search">
          <Search size={16} className="toolbar-search-icon" />
          <input
            className="toolbar-search-input"
            placeholder="Search by ASIN or Brand..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="toolbar-search-clear" onClick={() => { setSearch(""); setPage(1); }}>
              <X size={14} />
            </button>
          )}
        </div>

        <button
          className={`btn btn-filter ${showFilters || activeFilterCount > 0 ? "btn-filter-active" : ""}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="toolbar-sort">
          <select className="select" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
            {SORT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <button className="btn btn-sort-toggle" onClick={() => setSortOrder((o) => o === "asc" ? "desc" : "asc")}>
            {sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

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
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Expandable filters panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label className="filter-label">Brand</label>
            <input className="input" placeholder="Filter by brand..." value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} />
          </div>
          <div className="filter-group">
            <label className="filter-label">Status</label>
            <div className="status-chips">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  className={`status-chip ${status === s.value ? "status-chip-active" : ""}`}
                  onClick={() => { setStatus(s.value); setPage(1); }}
                  style={status === s.value && s.color ? { borderColor: s.color, background: s.color + "18", color: s.color } : {}}
                >
                  {s.color && <span className="status-chip-dot" style={{ background: s.color }} />}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label">Check Status</label>
            <div className="status-chips">
              {CHECKED_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className={`status-chip ${checkedAt === o.value ? "status-chip-active" : ""}`}
                  onClick={() => { setCheckedAt(o.value as "" | "null" | "not_null"); setPage(1); }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button className="btn btn-clear-filters" onClick={clearFilters}>
              <X size={14} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Record count */}
      {data && (
        <div className="table-record-count">
          {data.total.toLocaleString()} products
        </div>
      )}

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" className="checkbox" onChange={toggleSelectAll} checked={!!data && selected.size === data.items.length && data.items.length > 0} /></th>
              <th className="image-column">Img</th>
              <th className="asin-column" onClick={() => handleSort("asin")}>ASIN{sortIcon("asin")}</th>
              <th onClick={() => handleSort("brand")}>Brand{sortIcon("brand")}</th>
              <th onClick={() => handleSort("sales_rank_current")}>Sales Rank{sortIcon("sales_rank_current")}</th>
              <th onClick={() => handleSort("buybox_price")}>Buy Box{sortIcon("buybox_price")}</th>
              <th onClick={() => handleSort("rating")}>Rating{sortIcon("rating")}</th>
              <th onClick={() => handleSort("seller_status")}>Status{sortIcon("seller_status")}</th>
              <th className="score-column">Score</th>
              <th className="notes-column">Notes</th>
              <th onClick={() => handleSort("checked_at")}>Checked At{sortIcon("checked_at")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></td></tr>
            )}
            {data?.items.map((product: Product) => (
              <tr key={product.asin} className={selected.has(product.asin) ? "tr-selected" : ""}>
                <td><input type="checkbox" className="checkbox" checked={selected.has(product.asin)} onChange={() => toggleSelect(product.asin)} /></td>
                <td className="image-column">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="product-thumb" />
                  ) : (
                    <span className="product-thumb-placeholder" />
                  )}
                </td>
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
                <td>{product.sellerStatus?.checked_at ? new Date(product.sellerStatus.checked_at).toLocaleString() : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No products found</td></tr>
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
      {importResult && (
        <ImportSummaryModal
          result={importResult}
          isLoading={false}
          onClose={() => {
            setImportResult(null);
            prevProgressStatus.current = null;
            csvMutation.reset();
          }}
        />
      )}

    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="badge badge-unknown">—</span>;
  return <span className={`badge badge-${status}`}>{status.replace("_", " ")}</span>;
}