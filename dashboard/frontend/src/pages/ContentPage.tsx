import { useEffect, useState } from "react";
import * as api from "../api";
import type { ContentBrief } from "../types";

export default function ContentPage() {
  const [briefs, setBriefs]     = useState<ContentBrief[]>([]);
  const [market, setMarket]     = useState("dubai");
  const [theme, setTheme]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const [latest, setLatest]     = useState<ContentBrief | null>(null);
  const [toast, setToast]       = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    api.getContentHistory(market)
      .then(r => setBriefs(r.briefs || []))
      .finally(() => setFetching(false));
  }, [market]);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await api.generatePost(market, theme || undefined);
      setLatest(r.brief);
      setBriefs(b => [r.brief, ...b]);
      showToast("Post generated!");
    } catch (e: any) { showToast(e.message); }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">Daily Content</h1>
      <p className="text-muted text-sm mb-8">AI-generated social posts for each market</p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={market}
          onChange={e => setMarket(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="dubai">Dubai</option>
          <option value="uk">UK</option>
          <option value="us">US</option>
        </select>
        <input
          type="text"
          placeholder="Optional theme (e.g. AI automation)"
          value={theme}
          onChange={e => setTheme(e.target.value)}
          className="flex-1 min-w-56 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted"
        />
        <button
          onClick={generate}
          disabled={loading}
          className="px-5 py-2 bg-accent text-black font-semibold text-sm rounded-lg hover:bg-yellow-400 disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate Today's Post"}
        </button>
      </div>

      {/* Latest / just generated */}
      {latest && (
        <div className="bg-surface border border-accent/30 rounded-xl p-6 space-y-4 mb-8">
          <div className="flex items-center gap-2">
            <span className="text-accent text-xs font-semibold uppercase tracking-wider">Just Generated</span>
            <span className="text-muted text-xs">{latest.market} · {latest.theme}</span>
          </div>
          <p className="text-white text-sm whitespace-pre-line leading-relaxed">{latest.caption}</p>
          <p className="text-accent text-sm font-medium">{latest.cta}</p>
          <div className="flex flex-wrap gap-1.5">
            {(latest.hashtags || []).map((h: string) => (
              <span key={h} className="text-xs text-muted bg-white/5 px-2 py-0.5 rounded-full">#{h}</span>
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted font-medium mb-1">Image prompt (paste into Midjourney / DALL-E):</p>
            <div className="relative">
              <p className="text-xs text-gray-400 bg-bg rounded-lg p-3 pr-16 italic">{latest.image_prompt}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(latest.image_prompt); showToast("Copied!"); }}
                className="absolute right-2 top-2 text-xs text-muted hover:text-white border border-border px-2 py-1 rounded"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">History</h2>
      {fetching ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : briefs.length === 0 ? (
        <p className="text-muted text-sm">No posts generated yet. Click "Generate Today's Post" to start.</p>
      ) : (
        <div className="space-y-3">
          {briefs.map(b => (
            <div key={b.id} className="bg-surface border border-border rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white uppercase">{b.market}</span>
                  <span className="text-muted text-xs">·</span>
                  <span className="text-muted text-xs">{b.theme}</span>
                </div>
                <span className="text-muted text-xs">{new Date(b.generated_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-300 line-clamp-3">{b.caption}</p>
              <p className="text-xs text-accent">{b.cta}</p>
              <div className="flex flex-wrap gap-1">
                {(b.hashtags || []).slice(0, 5).map((h: string) => (
                  <span key={h} className="text-xs text-muted bg-white/5 px-1.5 py-0.5 rounded">#{h}</span>
                ))}
                {(b.hashtags || []).length > 5 && (
                  <span className="text-xs text-muted">+{b.hashtags.length - 5}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-surface border border-border text-white text-sm px-5 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
