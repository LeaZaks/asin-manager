// pages/PurchasesPage.tsx
import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchasesApi, creditCardsApi, type Purchase, type CreditCard } from "../api/purchasesApi";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US");
}
function fmtMoney(v: string | null) {
  if (v == null) return "—";
  return `$${parseFloat(v).toFixed(2)}`;
}
function shortUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

const SORT_FIELDS = [
  { key: "order_date", label: "Order Date" },
  { key: "delivery_date", label: "Delivery Date" },
  { key: "total_amount", label: "Total Amount" },
  { key: "quantity", label: "Quantity" },
  { key: "asin", label: "ASIN" },
  { key: "created_at", label: "Added" },
];

// ─── Purchase Form Modal ───────────────────────────────────────────────────────
interface PurchaseFormProps {
  initial?: Purchase | null;
  creditCards: CreditCard[];
  onClose: () => void;
  onSaved: () => void;
}

function PurchaseForm({ initial, creditCards, onClose, onSaved }: PurchaseFormProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    asin: initial?.asin ?? "",
    source_url: initial?.source_url ?? "",
    order_number: initial?.order_number ?? "",
    order_date: initial?.order_date ? initial.order_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    quantity: initial?.quantity?.toString() ?? "",
    total_amount: initial?.total_amount ?? "",
    tax_amount: initial?.tax_amount ?? "0",
    shipping_cost: initial?.shipping_cost ?? "0",
    delivery_date: initial?.delivery_date ? initial.delivery_date.slice(0, 10) : "",
    credit_card_id: initial?.credit_card_id?.toString() ?? "",
    coupons_used: initial?.coupons_used ?? "",
    notes: initial?.notes ?? "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.asin.trim()) { setError("ASIN is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== "") fd.append(k, v); });
      if (receiptFile) fd.append("receipt", receiptFile);

      if (isEdit) {
        await purchasesApi.update(initial!.id, fd);
      } else {
        await purchasesApi.create(fd);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{isEdit ? "Edit Purchase" : "New Purchase"}</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalBody}>
          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.formGrid}>
            <Field label="ASIN *">
              <input className="input" value={form.asin} onChange={set("asin")} disabled={isEdit} placeholder="B0XXXXXXXXX" />
            </Field>
            <Field label="Order Number">
              <input className="input" value={form.order_number} onChange={set("order_number")} placeholder="112-XXXXXXX-XXXXXXX" />
            </Field>
            <Field label="Source URL">
              <input className="input" value={form.source_url} onChange={set("source_url")} placeholder="https://..." />
            </Field>
            <Field label="Order Date">
              <input className="input" type="date" value={form.order_date} onChange={set("order_date")} />
            </Field>
            <Field label="Delivery Date">
              <input className="input" type="date" value={form.delivery_date} onChange={set("delivery_date")} />
            </Field>
            <Field label="Quantity">
              <input className="input" type="number" min="1" value={form.quantity} onChange={set("quantity")} />
            </Field>
            <Field label="Total Amount ($)">
              <input className="input" type="number" step="0.01" value={form.total_amount} onChange={set("total_amount")} />
            </Field>
            <Field label="TAX ($)">
              <input className="input" type="number" step="0.01" value={form.tax_amount} onChange={set("tax_amount")} />
            </Field>
            <Field label="Shipping Cost ($)">
              <input className="input" type="number" step="0.01" value={form.shipping_cost} onChange={set("shipping_cost")} />
            </Field>
            <Field label="Credit Card">
              <select className="select" style={{ width: "100%" }} value={form.credit_card_id} onChange={set("credit_card_id")}>
                <option value="">— None —</option>
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>{c.nickname} (*{c.last4})</option>
                ))}
              </select>
            </Field>
            <Field label="Coupons Used">
              <input className="input" value={form.coupons_used} onChange={set("coupons_used")} placeholder="SAVE10, PROMO5..." />
            </Field>
            <Field label="Receipt / Invoice" fullWidth>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  style={{ display: "none" }}
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                  📎 {receiptFile ? receiptFile.name : "Choose file"}
                </button>
                {isEdit && initial?.receipt_file && !receiptFile && (
                  <a href={initial.receipt_file} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                    📄 Existing file
                  </a>
                )}
              </div>
            </Field>
            <Field label="Notes" fullWidth>
              <textarea className="input" rows={3} value={form.notes} onChange={set("notes")} style={{ resize: "vertical" }} />
            </Field>
          </div>
        </div>
        <div style={styles.modalFooter}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// ─── Credit Card Manager Modal ────────────────────────────────────────────────
function CreditCardManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: cards = [] } = useQuery({ queryKey: ["credit-cards"], queryFn: creditCardsApi.list });
  const [last4, setLast4] = useState("");
  const [nickname, setNickname] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["credit-cards"] });

  const save = async () => {
    if (!last4 || last4.length !== 4 || !nickname) return;
    setSaving(true);
    try {
      if (editId) {
        await creditCardsApi.update(editId, { last4, nickname });
      } else {
        await creditCardsApi.create({ last4, nickname });
      }
      setLast4(""); setNickname(""); setEditId(null);
      refresh();
    } finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm("Delete this card?")) return;
    await creditCardsApi.delete(id);
    refresh();
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...styles.modal, maxWidth: 420 }}>
        <div style={styles.modalHeader}>
          <span style={{ fontWeight: 700 }}>Manage Credit Cards</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalBody}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="Last 4 digits" maxLength={4} value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} style={{ width: 130 }} />
            <input className="input" placeholder="Nickname (e.g. Amex Business)" value={nickname}
              onChange={(e) => setNickname(e.target.value)} />
            <button className="btn btn-primary" onClick={save} disabled={saving || last4.length !== 4 || !nickname}>
              {editId ? "Update" : "Add"}
            </button>
          </div>
          <table width="100%" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={styles.th}>Last 4</th>
                <th style={styles.th}>Nickname</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>*{c.last4}</td>
                  <td style={styles.td}>{c.nickname}</td>
                  <td style={{ ...styles.td, display: "flex", gap: 4 }}>
                    <button className="btn btn-secondary" style={{ padding: "4px 8px" }}
                      onClick={() => { setEditId(c.id); setLast4(c.last4); setNickname(c.nickname); }}>✏️</button>
                    <button className="btn btn-danger" style={{ padding: "4px 8px" }} onClick={() => del(c.id)}>🗑</button>
                  </td>
                </tr>
              ))}
              {cards.length === 0 && (
                <tr><td colSpan={3} style={{ ...styles.td, color: "#94a3b8", textAlign: "center" }}>No cards</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function PurchasesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("order_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Purchase | null>(null);
  const [showCards, setShowCards] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", page, search, sortBy, sortOrder],
    queryFn: () => purchasesApi.list({ page, limit: 50, search: search || undefined, sortBy, sortOrder }),
    placeholderData: (prev) => prev,
  });

  const { data: creditCards = [] } = useQuery({ queryKey: ["credit-cards"], queryFn: creditCardsApi.list });

  const deleteMutation = useMutation({
    mutationFn: purchasesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
  });

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortOrder("desc"); }
    setPage(1);
  };

  const sortIcon = (field: string) => sortBy === field ? (sortOrder === "asc" ? " ↑" : " ↓") : "";

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const openNew = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (p: Purchase) => { setEditItem(p); setShowForm(true); };
  const onSaved = () => qc.invalidateQueries({ queryKey: ["purchases"] });

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Purchases</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowCards(true)}>💳 Credit Cards</button>
          <button className="btn btn-primary" onClick={openNew}>+ New Purchase</button>
        </div>
      </div>

      {/* Search + Sort */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search by ASIN, order number..."
            value={search}
            onChange={handleSearch}
          />
        </div>
        <select className="select" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          {SORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setSortOrder((o) => o === "asc" ? "desc" : "asc")}>
          {sortOrder === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
      </div>

      {/* Count */}
      {data && <div className="table-record-count">{data.total.toLocaleString()} purchases</div>}

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th className="image-column" style={{ cursor: "default" }}>Img</th>
              <th onClick={() => handleSort("asin")}>ASIN{sortIcon("asin")}</th>
              <th>Source</th>
              <th onClick={() => handleSort("order_number")}>Order #{sortIcon("order_number")}</th>
              <th onClick={() => handleSort("order_date")}>Order Date{sortIcon("order_date")}</th>
              <th onClick={() => handleSort("quantity")}>Qty{sortIcon("quantity")}</th>
              <th onClick={() => handleSort("total_amount")}>Total{sortIcon("total_amount")}</th>
              <th>TAX</th>
              <th>Shipping</th>
              <th onClick={() => handleSort("delivery_date")}>Delivery Date{sortIcon("delivery_date")}</th>
              <th style={{ whiteSpace: "nowrap", width: 130 }}>Credit Card</th>
              <th style={{ whiteSpace: "nowrap" }}>Coupons</th>
              <th>Receipt</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={15} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading...</td></tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr><td colSpan={15} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No purchases found</td></tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id}>
                {/* Image */}
                <td className="image-column">
                  {p.product.image_url
                    ? <img src={p.product.image_url} alt={p.asin} className="product-thumb" />
                    : <span className="product-thumb-placeholder" />}
                </td>

                {/* ASIN + Amazon link */}
                <td className="asin-column">
                  <div className="asin-cell-content">
                    <a href={`/products/${p.asin}`} className="asin-link">{p.asin}</a>
                    {p.product.amazon_url && (
                      <a href={p.product.amazon_url} target="_blank" rel="noreferrer" className="amazon-link-icon" title="Open on Amazon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  {p.product.brand && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{p.product.brand}</div>}
                </td>

                {/* Source URL – shortened */}
                <td>
                  {p.source_url
                    ? <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 12 }}>{shortUrl(p.source_url)}</a>
                    : <span style={{ color: "#cbd5e1" }}>—</span>}
                </td>

                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.order_number || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                <td>{fmtDate(p.order_date)}</td>
                <td style={{ textAlign: "center" }}>{p.quantity ?? "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmtMoney(p.total_amount)}</td>
                <td>{fmtMoney(p.tax_amount)}</td>
                <td>{fmtMoney(p.shipping_cost)}</td>
                <td>{fmtDate(p.delivery_date)}</td>

                {/* Credit card */}
                <td style={{ whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden" }}>
                  {p.creditCard
                    ? <span style={styles.cardBadge} title={`${p.creditCard.nickname} *${p.creditCard.last4}`}>
                        {p.creditCard.nickname.length > 10
                          ? p.creditCard.nickname.slice(0, 10) + "…"
                          : p.creditCard.nickname} *{p.creditCard.last4}
                      </span>
                    : <span style={{ color: "#cbd5e1" }}>—</span>}
                </td>

                <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{p.coupons_used || <span style={{ color: "#cbd5e1" }}>—</span>}</td>

                {/* Receipt */}
                <td>
                  {p.receipt_file && p.receipt_file.startsWith("http")
                    ? <a href={p.receipt_file} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>📄</a>
                    : <span style={{ color: "#cbd5e1" }}>—</span>}
                </td>

                <td style={{ maxWidth: 160, fontSize: 12, color: "#475569" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {p.notes || ""}
                  </span>
                </td>

                {/* Actions */}
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => openEdit(p)}>✏️</button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      onClick={() => confirm("Delete this purchase?") && deleteMutation.mutate(p.id)}
                    >🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", justifyContent: "center" }}>
          <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 13, color: "#64748b" }}>Page {page} of {totalPages}</span>
          <button className="btn btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <PurchaseForm
          initial={editItem}
          creditCards={creditCards}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSaved={onSaved}
        />
      )}
      {showCards && <CreditCardManager onClose={() => setShowCards(false)} />}
    </div>
  );
}

// ─── Inline styles ─────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "white", borderRadius: 12, width: "min(780px, 95vw)",
    maxHeight: "90vh", display: "flex", flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
  },
  modalBody: { padding: 20, overflowY: "auto" },
  modalFooter: {
    display: "flex", gap: 8, justifyContent: "flex-end",
    padding: "12px 20px", borderTop: "1px solid #e2e8f0",
  },
  closeBtn: {
    background: "none", border: "none", cursor: "pointer", fontSize: 18,
    color: "#94a3b8", lineHeight: 1,
  },
  formGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px",
  },
  errorBox: {
    background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca",
    borderRadius: 7, padding: "10px 14px", marginBottom: 14, fontSize: 13,
  },
  cardBadge: {
    background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6,
    padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "#475569",
    whiteSpace: "nowrap" as const, display: "inline-block",
  },
  th: { padding: "8px 12px", textAlign: "left" as const, fontSize: 12, fontWeight: 600, color: "#64748b", borderBottom: "1px solid #e2e8f0" },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9" },
};