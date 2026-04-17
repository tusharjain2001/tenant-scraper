import { useEffect, useState } from "react";
import * as api from "../api";
import type { Summary } from "../types";

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <p className="text-muted text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-muted text-xs mt-1">{sub}</p>}
    </div>
  );
}

function ActionBtn({
  label, onClick, disabled, disabledTip, loading, variant = "default",
}: {
  label: string; onClick: () => void; disabled?: boolean; disabledTip?: string;
  loading?: boolean; variant?: "default" | "accent";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={disabled ? disabledTip : undefined}
      className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        variant === "accent"
          ? "bg-accent text-black hover:bg-yellow-400"
          : "bg-white/5 border border-border text-white hover:bg-white/10"
      }`}
    >
      {loading ? "Working…" : label}
    </button>
  );
}

export default function DashboardPage() {
  const [summary, setSummary]           = useState<Summary | null>(null);
  const [callsEnabled, setCallsEnabled] = useState(false);
  const [loading, setLoading]           = useState(true);

  // Modal state
  const [scrapeModal, setScrapeModal]   = useState(false);
  const [scrapeMarket, setScrapeMarket] = useState("dubai");
  const [scrapeType, setScrapeType]     = useState("agency");

  // Action loading states
  const [scraping, setScraping]   = useState(false);
  const [emailing, setEmailing]   = useState(false);
  const [calling, setCalling]     = useState(false);
  const [generating, setGenerating] = useState(false);

  // Latest generated post
  const [latestPost, setLatestPost] = useState<any>(null);
  const [toast, setToast]           = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => {
    Promise.all([api.getSummary(), api.getCallStatus()])
      .then(([s, c]) => { setSummary(s.summary); setCallsEnabled(c.configured); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const doScrape = async () => {
    setScrapeModal(false);
    setScraping(true);
    try {
      await api.startScrape(scrapeMarket, scrapeType);
      showToast(`Scraping ${scrapeMarket}/${scrapeType} started — check terminal for progress`);
    } catch (e: any) { showToast(e.message); }
    setScraping(false);
  };

  const doEmail = async () => {
    setEmailing(true);
    try {
      await api.startEmail();
      showToast("Email batch started — check terminal for progress");
    } catch (e: any) { showToast(e.message); }
    setEmailing(false);
  };

  const doCalls = async () => {
    setCalling(true);
    try {
      const r = await api.queueCalls("us", 20);
      showToast(`Queued ${r.queued} calls → sent to n8n`);
    } catch (e: any) { showToast(e.message); }
    setCalling(false);
  };

  const doGeneratePost = async () => {
    setGenerating(true);
    try {
      const r = await api.generatePost("dubai");
      setLatestPost(r.brief);
      showToast("Post generated!");
    } catch (e: any) { showToast(e.message); }
    setGenerating(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted">Loading…</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-muted text-sm mb-8">Lead ops overview — Dubai · UK · US</p>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Leads"    value={summary?.leads.total ?? 0} />
        <KpiCard label="Emails Today"   value={summary?.emails_today ?? 0} />
        <KpiCard label="In Sequence"    value={summary?.leads.active ?? 0} />
        <KpiCard label="Calls Queued"   value={summary?.calls_queued ?? 0} />
      </div>

      {/* Market breakdown */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KpiCard label="Dubai Leads" value={summary?.by_market.dubai ?? 0} />
        <KpiCard label="UK Leads"    value={summary?.by_market.uk ?? 0} />
        <KpiCard label="US Leads"    value={summary?.by_market.us ?? 0} />
      </div>

      {/* Sequence breakdown */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <KpiCard label="Replied"     value={summary?.leads.replied ?? 0} />
        <KpiCard label="Done (3/3)"  value={summary?.leads.done ?? 0} />
        <KpiCard label="Bounced"     value={summary?.leads.bounced ?? 0} />
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <ActionBtn label="Scrape Leads"         onClick={() => setScrapeModal(true)} loading={scraping} variant="accent" />
        <ActionBtn label="Start Emails"         onClick={doEmail}       loading={emailing} />
        <ActionBtn
          label="Queue Calls (US)"
          onClick={doCalls}
          loading={calling}
          disabled={!callsEnabled}
          disabledTip="Set ELEVENLABS_API_KEY and N8N_WEBHOOK_URL in backend .env to enable calling"
        />
        <ActionBtn label="Generate Today's Post" onClick={doGeneratePost} loading={generating} />
      </div>

      {/* Latest generated post */}
      {latestPost && (
        <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Latest Generated Post</h3>
            <span className="text-xs text-muted px-2 py-0.5 bg-white/5 rounded-full">{latestPost.market}</span>
          </div>
          <p className="text-sm text-gray-200 whitespace-pre-line">{latestPost.caption}</p>
          <p className="text-xs text-accent">{latestPost.cta}</p>
          <div className="flex flex-wrap gap-1">
            {(latestPost.hashtags || []).map((h: string) => (
              <span key={h} className="text-xs text-muted bg-white/5 px-2 py-0.5 rounded">#{h}</span>
            ))}
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted font-medium mb-1">Image prompt:</p>
            <p className="text-xs text-gray-400 italic">{latestPost.image_prompt}</p>
          </div>
        </div>
      )}

      {/* Scrape modal */}
      {scrapeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-2xl p-8 w-96 space-y-5">
            <h3 className="text-lg font-bold text-white">Start Scrape</h3>
            <div>
              <label className="text-xs text-muted mb-1 block">Market</label>
              <select
                value={scrapeMarket}
                onChange={e => setScrapeMarket(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="dubai">Dubai</option>
                <option value="uk">UK</option>
                <option value="us">US</option>
                <option value="all">All markets</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Lead Type</label>
              <select
                value={scrapeType}
                onChange={e => setScrapeType(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="agency">Agency</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScrapeModal(false)} className="flex-1 py-2 border border-border rounded-lg text-sm text-muted hover:text-white">Cancel</button>
              <button onClick={doScrape} className="flex-1 py-2 bg-accent text-black rounded-lg text-sm font-semibold hover:bg-yellow-400">Start</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-surface border border-border text-white text-sm px-5 py-3 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
