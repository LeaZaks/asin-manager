import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { productsApi, tagsApi, evaluationsApi } from "../api";
import type { Tag } from "../types";
import { TagChips } from "../components/TagChips";

export function ProductDetailPage() {
  const { asin } = useParams<{ asin: string }>();
  const qc = useQueryClient();

  const [score, setScore] = useState<number>(0);
  const [note, setNote] = useState("");
  const [evalSaved, setEvalSaved] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", asin],
    queryFn: () => productsApi.getOne(asin!),
    enabled: !!asin,
  });

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  const evalMutation = useMutation({
    mutationFn: () => evaluationsApi.upsert(asin!, score, note || undefined),
    onSuccess: () => {
      setEvalSaved(true);
      setTimeout(() => setEvalSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ["product", asin] });
    },
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}><span className="spinner" /></div>;
  if (!product) return <div style={{ padding: 40 }}><p>Product not found.</p><Link to="/products">← Back</Link></div>;

  const ev = product.evaluation;
  const currentScore = score || ev?.score || 0;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/products" style={{ color: "#64748b", textDecoration: "none" }}>← Products</Link>
          <h1 className="page-title" style={{ margin: 0 }}>{product.asin}</h1>
          {product.brand && <span style={{ color: "#64748b", fontWeight: 400 }}>{product.brand}</span>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Seller Status */}
        <div className="card">
          <div className="card-title">Seller Status</div>
          {product.sellerStatus ? (
            <>
              <span className={`badge badge-${product.sellerStatus.status}`} style={{ fontSize: 13, padding: "4px 12px" }}>
                {product.sellerStatus.status.replace("_", " ").toUpperCase()}
              </span>
              {product.sellerStatus.checked_at && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                  Checked: {new Date(product.sellerStatus.checked_at).toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">Not yet checked</p>
          )}
        </div>

        {/* Product Potential / Evaluation */}
        <div className="card">
          <div className="card-title">Product Potential (Score 1-5)</div>
          <div className="flex gap-2 mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className="score-star"
                style={{
                  fontSize: 24,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: s <= currentScore ? (currentScore <= 2 ? "#ef4444" : currentScore === 3 ? "#f59e0b" : "#22c55e") : "#e2e8f0",
                }}
                onClick={() => setScore(s)}
              >
                ★
              </button>
            ))}
            {currentScore > 0 && <span className={`score-${currentScore}`}>{currentScore}/5</span>}
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Notes on this score (optional)"
            defaultValue={ev?.note ?? ""}
            onChange={(e) => setNote(e.target.value)}
            style={{ resize: "vertical" }}
          />
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => evalMutation.mutate()}
              disabled={currentScore === 0 || evalMutation.isPending}
            >
              {evalMutation.isPending ? <span className="spinner" /> : "Save Score"}
            </button>
            {evalSaved && <span className="success-text">✓ Saved!</span>}
          </div>
        </div>

        {/* Tags */}
        <div className="card">
          <div className="card-title">Tags &amp; Warnings</div>
          <TagChips
            asin={product.asin}
            productTags={product.productTags}
            allTags={allTags}
            showAll
          />
        </div>

        {/* Keepa Data */}
        <div className="card">
          <div className="card-title">Keepa Data</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 13 }}>
            <KeepaRow label="Sales Rank" value={product.sales_rank_current?.toLocaleString()} />
            <KeepaRow label="Sales Rank 90d avg" value={product.sales_rank_avg_90d?.toLocaleString()} />
            <KeepaRow label="Sales Rank 90d drop" value={product.sales_rank_drop_90d != null ? `${product.sales_rank_drop_90d}%` : undefined} />
            <KeepaRow label="Bought Past Month" value={product.bought_past_month?.toLocaleString()} />
            <KeepaRow label="Rating" value={product.rating != null ? `⭐ ${product.rating}` : undefined} />
            <KeepaRow label="Rating Count" value={product.rating_count?.toLocaleString()} />
            <KeepaRow label="Buy Box Price" value={product.buybox_price != null ? `$${product.buybox_price.toFixed(2)}` : undefined} />
            <KeepaRow label="Buy Box 90d avg" value={product.buybox_price_avg_90d != null ? `$${product.buybox_price_avg_90d.toFixed(2)}` : undefined} />
            <KeepaRow label="Buy Box Lowest" value={product.buybox_price_lowest != null ? `$${product.buybox_price_lowest.toFixed(2)}` : undefined} />
            <KeepaRow label="Buy Box Highest" value={product.buybox_price_highest != null ? `$${product.buybox_price_highest.toFixed(2)}` : undefined} />
            <KeepaRow label="Amazon 180d share" value={product.amazon_share_180d != null ? `${product.amazon_share_180d}%` : undefined} />
            <KeepaRow label="Referral Fee" value={product.referral_fee != null ? `$${product.referral_fee.toFixed(2)}` : undefined} />
            <KeepaRow label="Total Offers" value={product.offer_count_total?.toString()} />
            <KeepaRow label="New Offers" value={product.new_offer_count_current?.toString()} />
            <KeepaRow label="Category Root" value={product.category_root ?? undefined} />
            <KeepaRow label="Category Sub" value={product.category_sub ?? undefined} />
            <KeepaRow label="Brand" value={product.brand ?? undefined} />
            <KeepaRow label="Amazon URL" value={product.amazon_url || `https://www.amazon.com/dp/${product.asin}?psc=1`} isLink />
            <KeepaRow label="Is HazMat" value={product.is_hazmat != null ? (product.is_hazmat ? "Yes ⚠️" : "No") : undefined} />
            <KeepaRow label="Is Heat Sensitive" value={product.is_heat_sensitive != null ? (product.is_heat_sensitive ? "Yes" : "No") : undefined} />
            <KeepaRow label="Package Weight" value={product.package_weight_g != null ? `${product.package_weight_g}g` : undefined} />
            <KeepaRow label="Added" value={new Date(product.created_at).toLocaleDateString()} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KeepaRow({ label, value, isLink = false }: { label: string; value?: string; isLink?: boolean }) {  return (
    <div>
      <span style={{ color: "#64748b" }}>{label}: </span>
    </div>
  );
}
