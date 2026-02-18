from pathlib import Path

# 1) prisma schema
p = Path("backend/prisma/schema.prisma")
s = p.read_text(encoding="utf-8")
if "notes                   String?" not in s:
    s = s.replace("  image_url               String?\n", "  image_url               String?\n  notes                   String?\n")
p.write_text(s, encoding="utf-8")

# 2) migration
m = Path("backend/prisma/migrations/20260218000000_add_notes_to_products.sql")
m.parent.mkdir(parents=True, exist_ok=True)
m.write_text('ALTER TABLE "products"\nADD COLUMN IF NOT EXISTS "notes" TEXT;\n', encoding="utf-8")

# 3) backend constants
p = Path("backend/src/constants/products.ts")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text("export const PRODUCT_NOTES_MAX_LENGTH = 1000;\n", encoding="utf-8")

# 4) frontend constants
p = Path("frontend/src/constants/products.ts")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text("export const PRODUCT_NOTES_MAX_LENGTH = 1000;\n", encoding="utf-8")

# 5) controller
p = Path("backend/src/controllers/products.controller.ts")
s = p.read_text(encoding="utf-8")
if 'import { PRODUCT_NOTES_MAX_LENGTH } from "../constants/products";' not in s:
    s = s.replace(
        'import { AppError } from "../middleware/errorHandler";\n',
        'import { AppError } from "../middleware/errorHandler";\nimport { PRODUCT_NOTES_MAX_LENGTH } from "../constants/products";\n'
    )
if "async updateNotes(req: Request, res: Response)" not in s:
    s = s.replace(
        "  async deleteMany(req: Request, res: Response) {\n    const { asins } = req.body as { asins: string[] };\n    if (!Array.isArray(asins) || asins.length === 0) {\n      throw new AppError(400, \"Body must contain non-empty asins array\");\n    }\n    const result = await productsRepository.deleteMany(asins);\n    res.json({ deleted: result.count });\n  },\n",
        "  async deleteMany(req: Request, res: Response) {\n    const { asins } = req.body as { asins: string[] };\n    if (!Array.isArray(asins) || asins.length === 0) {\n      throw new AppError(400, \"Body must contain non-empty asins array\");\n    }\n    const result = await productsRepository.deleteMany(asins);\n    res.json({ deleted: result.count });\n  },\n\n  async updateNotes(req: Request, res: Response) {\n    const { asin } = req.params;\n    const { notes } = req.body as { notes?: string | null };\n\n    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, \"notes\")) {\n      throw new AppError(400, \"Body must include notes field\");\n    }\n\n    if (notes !== null && typeof notes !== \"string\") {\n      throw new AppError(400, \"notes must be a string or null\");\n    }\n\n    const normalizedNotes = typeof notes === \"string\" ? notes.trim() : null;\n    if (normalizedNotes && normalizedNotes.length > PRODUCT_NOTES_MAX_LENGTH) {\n      throw new AppError(400, `notes cannot exceed ${PRODUCT_NOTES_MAX_LENGTH} characters`);\n    }\n\n    const product = await productsRepository.updateNotes(asin.toUpperCase(), normalizedNotes || null);\n    res.json(product);\n  },\n"
    )
p.write_text(s, encoding="utf-8")

# 6) repository
p = Path("backend/src/repositories/products.repository.ts")
s = p.read_text(encoding="utf-8")
if "async updateNotes(asin: string, notes: string | null)" not in s:
    insert = """
  async updateNotes(asin: string, notes: string | null) {
    try {
      return await prisma.product.update({
        where: { asin },
        data: { notes },
        include: {
          sellerStatus: true,
          evaluation: true,
          productTags: { include: { tag: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(404, `ASIN ${asin} not found`);
      }
      throw error;
    }
  },

"""
    s = s.replace(
        "  async deleteMany(asins: string[]) {\n    return prisma.product.deleteMany({\n      where: { asin: { in: asins } },\n    });\n  },\n\n",
        "  async deleteMany(asins: string[]) {\n    return prisma.product.deleteMany({\n      where: { asin: { in: asins } },\n    });\n  },\n\n" + insert
    )
p.write_text(s, encoding="utf-8")

# 7) routes
p = Path("backend/src/routes/products.routes.ts")
s = p.read_text(encoding="utf-8")
line = 'router.patch("/:asin/notes", productsController.updateNotes);\n'
if line not in s:
    s = s.replace('router.get("/:asin", productsController.getOne);\n\n', 'router.get("/:asin", productsController.getOne);\n\n' + line + '\n')
p.write_text(s, encoding="utf-8")

# 8) type
p = Path("frontend/src/types/index.ts")
s = p.read_text(encoding="utf-8")
if "  notes: string | null;" not in s:
    s = s.replace("  image_url: string | null;\n", "  image_url: string | null;\n  notes: string | null;\n")
p.write_text(s, encoding="utf-8")

# 9) api
p = Path("frontend/src/api/index.ts")
s = p.read_text(encoding="utf-8")
if "updateNotes: (asin: string, notes: string | null)" not in s:
    s = s.replace(
        "  deleteMany: (asins: string[]) =>\n    api.delete<{ deleted: number }>(\"/products\", { data: { asins } }).then((r) => r.data),\n};\n",
        "  deleteMany: (asins: string[]) =>\n    api.delete<{ deleted: number }>(\"/products\", { data: { asins } }).then((r) => r.data),\n\n  updateNotes: (asin: string, notes: string | null) =>\n    api.patch<Product>(`/products/${encodeURIComponent(asin)}/notes`, { notes }).then((r) => r.data),\n};\n"
    )
p.write_text(s, encoding="utf-8")

# 10) editor component
p = Path("frontend/src/components/NotesInlineEditor.tsx")
p.write_text("""import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api";
import { PRODUCT_NOTES_MAX_LENGTH } from "../constants/products";

interface NotesInlineEditorProps {
  asin: string;
  currentNotes: string | null;
}

export function NotesInlineEditor({ asin, currentNotes }: NotesInlineEditorProps) {
  const qc = useQueryClient();
  const [value, setValue] = useState(currentNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentNotes ?? "");
    setError(null);
  }, [currentNotes]);

  const mutation = useMutation({
    mutationFn: (notes: string | null) => productsApi.updateNotes(asin, notes),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", asin] });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to save");
    },
  });

  function saveIfChanged() {
    if (mutation.isPending) return;
    const normalized = value.trim();
    const original = (currentNotes ?? "").trim();
    if (normalized === original) return;
    mutation.mutate(normalized || null);
  }

  return (
    <div className="notes-inline-editor">
      <input
        className="notes-inline-input"
        value={value}
        placeholder="Add note..."
        maxLength={PRODUCT_NOTES_MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onBlur={saveIfChanged}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={mutation.isPending}
        title={mutation.isPending ? "Saving..." : "Press Enter to save"}
      />
      <span className="notes-inline-count">{value.length}/{PRODUCT_NOTES_MAX_LENGTH}</span>
      {error && <span className="notes-inline-error">{error}</span>}
    </div>
  );
}
""", encoding="utf-8")

# 11) products page
p = Path("frontend/src/pages/ProductsPage.tsx")
s = p.read_text(encoding="utf-8")
s = s.replace('import { productsApi, importApi, tagsApi } from "../api";', 'import { productsApi, importApi } from "../api";')
s = s.replace('import type { Product, Tag } from "../types";', 'import type { Product } from "../types";')
s = s.replace('import { TagChips } from "../components/TagChips";', 'import { NotesInlineEditor } from "../components/NotesInlineEditor";')
s = s.replace(
"""  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

""", ""
)
s = s.replace('<th className="tags-column">Tags</th>', '<th className="notes-column">Notes</th>')
s = s.replace(
"""                <td className="tags-column">
                  <TagChips
                    asin={product.asin}
                    productTags={product.productTags}
                    allTags={allTags}
                  />
                </td>""",
"""                <td className="notes-column">
                  <NotesInlineEditor asin={product.asin} currentNotes={product.notes} />
                </td>"""
)
p.write_text(s, encoding="utf-8")

# 12) css
p = Path("frontend/src/styles.css")
s = p.read_text(encoding="utf-8")
if ".notes-inline-editor" not in s:
    s += """

.notes-column { width: 220px; min-width: 220px; max-width: 220px; }
.notes-inline-editor { display: flex; flex-direction: column; gap: 2px; }
.notes-inline-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; font-size: 12px; color: #334155; background: #fff; }
.notes-inline-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
.notes-inline-input:disabled { opacity: .7; }
.notes-inline-count { color: #94a3b8; font-size: 11px; line-height: 1.2; text-align: right; }
.notes-inline-error { color: #dc2626; font-size: 11px; line-height: 1.2; }
"""
p.write_text(s, encoding="utf-8")
