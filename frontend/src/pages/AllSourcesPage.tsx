import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink, Search, X, Plus, Check, Pencil, Trash2 } from "lucide-react";
import { sourcesApi } from "../api";
import type { ProductSource } from "../types";

// Extended type that includes product info joined from backend
interface SourceWithProduct extends ProductSource {
  product?: {
    asin: string;
    image_url: string | null;
    brand: string | null;
  };
}

export function AllSourcesPage() {
  const location = useLocation();
  const qc = useQueryClient();

  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("asin") ?? "";
  });

  // Form state for quick-add
  const [showAdd, setShowAdd] = useState(() => !!new URLSearchParams(location.search).get("asin"));
  const [formAsin, setFormAsin] = useState(() => new URLSearchParams(location.search).get("asin") ?? "");
  const [formUrl, setFormUrl] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");

  function startEdit(source: SourceWithProduct) {
    setEditingId(source.id);
    setEditUrl(source.url ?? "");
    setEditSupplier(source.supplier_name);
    setEditPrice(source.purchase_price != null ? String(source.purchase_price) : "");
    setEditNotes(source.notes ?? "");
  }

  // Re-apply if navigating to the page with a different ?asin=
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const asin = params.get("asin");
    if (asin) {
      setSearch(asin);
      setShowAdd(true);
      setFormAsin(asin);
    }
  }, [location.search]);

  const createMutation = useMutation({
    mutationFn: () =>
      sourcesApi.create(formAsin.trim().toUpperCase(), {
        supplier_name: formSupplier.trim() || formUrl,
        url: formUrl.trim() || null,
        purchase_price: formPrice ? parseFloat(formPrice) : null,
        notes: formNotes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources-all"] });
      setShowAdd(false);
      setFormUrl("");
      setFormSupplier("");
      setFormPrice("");
      setFormNotes("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      sourcesApi.update(
        sources.find((s) => s.id === editingId)!.asin,
        editingId!,
        {
          supplier_name: editSupplier.trim() || editUrl,
          url: editUrl.trim() || null,
          purchase_price: editPrice ? parseFloat(editPrice) : null,
          notes: editNotes.trim() || null,
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources-all"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (source: SourceWithProduct) => sourcesApi.delete(source.asin, source.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources-all"] }),
  });

  const { data: sources = [], isLoading, isError } = useQuery<SourceWithProduct[]>({
    queryKey: ["sources-all"],
    queryFn: () => sourcesApi.listAll(),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return sources;
    const q = search.toLowerCase();
    return sources.filter(
      (s) =>
        s.asin.toLowerCase().includes(q) ||
        (s.product?.brand ?? "").toLowerCase().includes(q) ||
        s.supplier_name.toLowerCase().includes(q)
    );
  }, [sources, search]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sources</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {sources.length > 0 && `${filtered.length} of ${sources.length} source${sources.length > 1 ? "s" : ""}`}
          </span>
          {!showAdd && (
            <button className="btn btn-primary" onClick={() => { setShowAdd(true); setFormAsin(""); }}>
              <Plus size={14} /> Add Source
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-search">
          <Search size={16} className="toolbar-search-icon" />
          <input
            className="toolbar-search-input"
            placeholder="Search by ASIN, Brand or Supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="toolbar-search-clear" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Quick-add form */}
      {showAdd && (
        <div style={{
          background: "white", border: "1px solid #e2e8f0", borderRadius: 10,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, color: "#0f172a" }}>
            Add Source {formAsin && <span style={{ color: "#64748b", fontWeight: 400 }}>· {formAsin}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div>
                <label className="label">ASIN *</label>
                <input
                  className="input"
                  placeholder="e.g. B07XXXX"
                  value={formAsin}
                  onChange={(e) => setFormAsin(e.target.value.toUpperCase())}
                  maxLength={10}
                  style={{ fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label className="label">Purchase Price ($)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">URL / Link *</label>
              <input
                className="input"
                type="url"
                placeholder="https://..."
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                autoFocus={!formAsin}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="label">Supplier / Site</label>
                <input
                  className="input"
                  placeholder="e.g. Alibaba, wholesale..."
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <input
                  className="input"
                  placeholder="MOQ, lead time..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
              <X size={13} /> Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => createMutation.mutate()}
              disabled={!formAsin.trim() || !formUrl.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <span className="spinner" /> : <Check size={13} />}
              Save Source
            </button>
          </div>
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>Img</th>
              <th style={{ width: 130 }}>ASIN</th>
              <th>Supplier / Site</th>
              <th style={{ width: 220 }}>URL</th>
              <th style={{ width: 110 }}>Purchase Price</th>
              <th>Notes</th>
              <th style={{ width: 130 }}>Added</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40 }}>
                  <span className="spinner" />
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#ef4444" }}>
                  Failed to load sources.
                </td>
              </tr>
            )}
            {!isLoading && sources.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                  No sources yet — add them from a product page.
                </td>
              </tr>
            )}
            {!isLoading && sources.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                  No sources match "{search}"
                </td>
              </tr>
            )}
            {filtered.map((source) => (
              <tr key={source.id}>
                {/* Image */}
                <td className="image-column">
                  {source.product?.image_url ? (
                    <img src={source.product.image_url} alt="" className="product-thumb" />
                  ) : (
                    <span className="product-thumb-placeholder" />
                  )}
                </td>

                {/* ASIN */}
                <td>
                  <Link to={`/products/${source.asin}`} className="asin-link" style={{ width: "auto" }}>
                    {source.asin}
                  </Link>
                  {source.product?.brand && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{source.product.brand}</div>
                  )}
                </td>

                {/* Supplier */}
                <td style={{ fontWeight: 500, color: "#0f172a" }}>
                  {editingId === source.id ? (
                    <input className="input" style={{ fontSize: 12 }} value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} placeholder="Supplier / Site" />
                  ) : source.supplier_name}
                </td>

                {/* URL */}
                <td>
                  {editingId === source.id ? (
                    <input className="input" style={{ fontSize: 12 }} type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://..." />
                  ) : source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={source.url}>
                      <ExternalLink size={11} />
                      {source.url.replace(/^https?:\/\//, "").slice(0, 35)}{source.url.replace(/^https?:\/\//, "").length > 35 && "…"}
                    </a>
                  ) : <span className="text-muted">—</span>}
                </td>

                {/* Price */}
                <td>
                  {editingId === source.id ? (
                    <input className="input" style={{ fontSize: 12 }} type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0.00" />
                  ) : source.purchase_price != null ? (
                    <span style={{ background: "#f0fdf4", color: "#16a34a", fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 5, border: "1px solid #bbf7d0" }}>
                      ${Number(source.purchase_price).toFixed(2)}
                    </span>
                  ) : <span className="text-muted">—</span>}
                </td>

                {/* Notes */}
                <td style={{ fontSize: 12, color: "#64748b" }}>
                  {editingId === source.id ? (
                    <input className="input" style={{ fontSize: 12 }} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes..." />
                  ) : source.notes ?? <span className="text-muted">—</span>}
                </td>

                {/* Date */}
                <td style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {new Date(source.created_at).toLocaleDateString()}
                </td>

                {/* Actions */}
                <td>
                  {editingId === source.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-secondary" style={{ padding: "4px 7px" }} onClick={() => setEditingId(null)}>
                        <X size={12} />
                      </button>
                      <button className="btn btn-primary" style={{ padding: "4px 7px" }} onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Check size={12} />}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-secondary" style={{ padding: "4px 7px" }} title="Edit" onClick={() => startEdit(source)}>
                        <Pencil size={12} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: "4px 7px" }} title="Delete" disabled={deleteMutation.isPending} onClick={() => { if (confirm("Delete this source?")) deleteMutation.mutate(source); }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}