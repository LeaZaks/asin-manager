import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "../api";
import type { Tag } from "../types";

export function TagsPage() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"warning" | "note">("note");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");

  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  const createMutation = useMutation({
    mutationFn: () => tagsApi.create({ name: newName.trim(), type: newType }),
    onSuccess: () => { setNewName(""); qc.invalidateQueries({ queryKey: ["tags"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => tagsApi.update(id, { name }),
    onSuccess: () => { setEditingId(null); qc.invalidateQueries({ queryKey: ["tags"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tag Management</h1>
      </div>

      {/* Create tag */}
      <div className="card">
        <div className="card-title">Create New Tag</div>
        <div className="flex gap-2" style={{ maxWidth: 480 }}>
          <input
            className="input"
            placeholder="Tag name (e.g. IP Complaint, Private Label)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMutation.mutate()}
          />
          <select className="select" value={newType} onChange={(e) => setNewType(e.target.value as "warning" | "note")}>
            <option value="warning">⚠️ Warning</option>
            <option value="note">📝 Note</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={() => { setError(""); createMutation.mutate(); }}
            disabled={!newName.trim() || createMutation.isPending}
          >
            Add Tag
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {/* Tags list */}
      <div className="card">
        <div className="card-title">All Tags ({tags.length})</div>
        {isLoading && <p><span className="spinner" /></p>}
        <div className="table-wrapper" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag: Tag) => (
                <tr key={tag.id}>
                  <td>
                    {editingId === tag.id ? (
                      <div className="flex gap-2">
                        <input
                          className="input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ maxWidth: 200 }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateMutation.mutate({ id: tag.id, name: editName });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button className="btn btn-primary" style={{ padding: "4px 10px" }}
                          onClick={() => updateMutation.mutate({ id: tag.id, name: editName })}>
                          Save
                        </button>
                        <button className="btn btn-secondary" style={{ padding: "4px 10px" }}
                          onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span>
                        <span className={`tag-chip ${tag.type === "warning" ? "tag-chip-warning" : ""}`}>
                          {tag.type === "warning" ? "⚠️" : "📝"} {tag.name}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${tag.type === "warning" ? "badge-restricted" : "badge-unknown"}`}>
                      {tag.type}
                    </span>
                  </td>
                  <td>{new Date(tag.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}
                      >
                        ✏️ Rename
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => {
                          setError("");
                          if (confirm(`Delete tag "${tag.name}"? This will fail if any products are using it.`)) {
                            deleteMutation.mutate(tag.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tags.length === 0 && !isLoading && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "#94a3b8", padding: 30 }}>No tags yet. Create your first tag above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
