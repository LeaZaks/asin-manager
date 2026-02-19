import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Plus, ExternalLink, X, Check } from "lucide-react";
import { sourcesApi } from "../api";
import type { ProductSource } from "../types";

interface Props {
  asin: string;
}

interface SourceFormData {
  supplier_name: string;
  url: string;
  purchase_price: string;
  notes: string;
}

const emptyForm = (): SourceFormData => ({
  supplier_name: "",
  url: "",
  purchase_price: "",
  notes: "",
});

export function SourcesTab({ asin }: Props) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SourceFormData>(emptyForm());
  const [editForm, setEditForm] = useState<SourceFormData>(emptyForm());

  const { data: sources = [], isLoading } = useQuery<ProductSource[]>({
    queryKey: ["sources", asin],
    queryFn: () => sourcesApi.list(asin),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      sourcesApi.create(asin, {
        supplier_name: form.supplier_name.trim() || form.url.trim(),
        url: form.url.trim() || null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources", asin] });
      setShowAdd(false);
      setForm(emptyForm());
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) =>
      sourcesApi.update(asin, id, {
        supplier_name: editForm.supplier_name.trim(),
        url: editForm.url.trim() || null,
        purchase_price: editForm.purchase_price ? parseFloat(editForm.purchase_price) : null,
        notes: editForm.notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources", asin] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => sourcesApi.delete(asin, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources", asin] });
    },
  });

  function startEdit(source: ProductSource) {
    setEditingId(source.id);
    setEditForm({
      supplier_name: source.supplier_name,
      url: source.url ?? "",
      purchase_price: source.purchase_price != null ? String(source.purchase_price) : "",
      notes: source.notes ?? "",
    });
  }

  function handleDelete(id: number) {
    if (confirm("Delete this source?")) {
      deleteMutation.mutate(id);
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {sources.length === 0 ? "No sources yet" : `${sources.length} source${sources.length > 1 ? "s" : ""}`}
        </span>
        {!showAdd && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: "6px 12px" }}
            onClick={() => { setShowAdd(true); setEditingId(null); }}
          >
            <Plus size={13} /> Add Source
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{
          background: "#f8fafc", border: "1px solid #e2e8f0",
          borderRadius: 8, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: "#0f172a" }}>New Source</div>
          <SourceForm
            data={form}
            onChange={setForm}
            onSave={() => { if (form.url.trim()) createMutation.mutate(); }}
            onCancel={() => { setShowAdd(false); setForm(emptyForm()); }}
            isSaving={createMutation.isPending}
          />
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 && !showAdd ? (
        <div style={{
          textAlign: "center", padding: "40px 0", color: "#94a3b8",
          border: "2px dashed #e2e8f0", borderRadius: 8,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 13 }}>No sources added yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Source" to add a supplier or website</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sources.map((source) => (
            <div
              key={source.id}
              style={{
                background: "white", border: "1px solid #e2e8f0",
                borderRadius: 8, padding: "14px 16px",
              }}
            >
              {editingId === source.id ? (
                <SourceForm
                  data={editForm}
                  onChange={setEditForm}
                  onSave={() => { if (editForm.url.trim()) updateMutation.mutate(source.id); }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateMutation.isPending}
                />
              ) : (
                <SourceRow
                  source={source}
                  onEdit={() => startEdit(source)}
                  onDelete={() => handleDelete(source.id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === source.id}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SourceRow ─────────────────────────────────────────────────── */

function SourceRow({
  source,
  onEdit,
  onDelete,
  isDeleting,
}: {
  source: ProductSource;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Supplier name */}
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
            {source.supplier_name}
          </div>

          {/* URL */}
          {source.url && (
            <div style={{ marginBottom: 4 }}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#2563eb", fontSize: 12, textDecoration: "none",
                  display: "inline-flex", alignItems: "center", gap: 3,
                }}
              >
                <ExternalLink size={11} />
                {source.url.length > 60 ? source.url.slice(0, 60) + "…" : source.url}
              </a>
            </div>
          )}

          {/* Price + Notes row */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
            {source.purchase_price != null && (
              <span style={{
                background: "#f0fdf4", color: "#16a34a",
                fontSize: 12, fontWeight: 600,
                padding: "2px 8px", borderRadius: 5,
                border: "1px solid #bbf7d0",
              }}>
                ${Number(source.purchase_price).toFixed(2)}
              </span>
            )}
            {source.notes && (
              <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
                {source.notes}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            className="btn btn-secondary"
            style={{ padding: "5px 8px", fontSize: 12 }}
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="btn btn-danger"
            style={{ padding: "5px 8px", fontSize: 12 }}
            title="Delete"
          >
            {isDeleting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 6 }}>
        Added {new Date(source.created_at).toLocaleDateString()}
        {source.updated_at !== source.created_at && ` · Updated ${new Date(source.updated_at).toLocaleDateString()}`}
      </div>
    </div>
  );
}

/* ── SourceForm ─────────────────────────────────────────────────── */

function SourceForm({
  data,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: {
  data: SourceFormData;
  onChange: (d: SourceFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const set = (field: keyof SourceFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [field]: e.target.value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="label">Supplier / Site</label>
          <input
            className="input"
            placeholder="e.g. Amazon Wholesale, Alibaba..."
            value={data.supplier_name}
            onChange={set("supplier_name")}
            autoFocus
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
            value={data.purchase_price}
            onChange={set("purchase_price")}
          />
        </div>
      </div>
      <div>
        <label className="label">URL / Link</label>
        <input
          className="input"
          type="url"
          placeholder="https://..."
          value={data.url}
          onChange={set("url")}
        />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          rows={2}
          placeholder="MOQ, lead time, contact info..."
          value={data.notes}
          onChange={set("notes")}
          style={{ resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
          <X size={13} /> Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={!data.url.trim() || isSaving}
        >
          {isSaving ? <span className="spinner" /> : <Check size={13} />}
          Save
        </button>
      </div>
    </div>
  );
}