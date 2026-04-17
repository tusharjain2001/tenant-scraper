import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import type { Summary } from "../types";

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  disabledTip,
  loading,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTip?: string;
  loading?: boolean;
  variant?: "default" | "accent";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={disabled ? disabledTip : undefined}
      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "accent"
          ? "bg-accent text-black hover:bg-yellow-400"
          : "border border-border bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      {loading ? "Working..." : label}
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [callsEnabled, setCallsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [scrapeModal, setScrapeModal] = useState(false);
  const [scrapeMarket, setScrapeMarket] = useState("dubai");
  const [scrapeType, setScrapeType] = useState("agency");

  const [scraping, setScraping] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [calling, setCalling] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [latestPost, setLatestPost] = useState<any>(null);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => {
    Promise.all([api.getSummary(), api.getCallStatus()])
      .then(([summaryResponse, callResponse]) => {
        setSummary(summaryResponse.summary);
        setCallsEnabled(callResponse.configured);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const doScrape = async () => {
    setScrapeModal(false);
    setScraping(true);
    try {
      await api.startScrape(scrapeMarket, scrapeType);
      showToast(`Scraping ${scrapeMarket}/${scrapeType} started. Check the terminal for progress.`);
    } catch (error: any) {
      showToast(error.message);
    }
    setScraping(false);
  };

  const doEmail = async () => {
    setEmailing(true);
    try {
      await api.startEmail();
      showToast("Email batch started. Check the terminal for progress.");
    } catch (error: any) {
      showToast(error.message);
    }
    setEmailing(false);
  };

  const doCalls = async () => {
    setCalling(true);
    navigate("/calls");
    setCalling(false);
  };

  const doGeneratePost = async () => {
    setGenerating(true);
    try {
      const response = await api.generatePost("dubai");
      setLatestPost(response.brief);
      showToast("Post generated.");
    } catch (error: any) {
      showToast(error.message);
    }
    setGenerating(false);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-white">Dashboard</h1>
      <p className="mb-8 text-sm text-muted">Lead ops overview for Dubai, UK, and US.</p>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Leads" value={summary?.leads.total ?? 0} />
        <KpiCard label="Emails Today" value={summary?.emails_today ?? 0} />
        <KpiCard label="In Sequence" value={summary?.leads.active ?? 0} />
        <KpiCard label="Calls Queued" value={summary?.calls_queued ?? 0} />
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <KpiCard label="Dubai Leads" value={summary?.by_market.dubai ?? 0} />
        <KpiCard label="UK Leads" value={summary?.by_market.uk ?? 0} />
        <KpiCard label="US Leads" value={summary?.by_market.us ?? 0} />
      </div>

      <div className="mb-10 grid grid-cols-3 gap-4">
        <KpiCard label="Replied" value={summary?.leads.replied ?? 0} />
        <KpiCard label="Done (3/3)" value={summary?.leads.done ?? 0} />
        <KpiCard label="Bounced" value={summary?.leads.bounced ?? 0} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ActionBtn label="Scrape Leads" onClick={() => setScrapeModal(true)} loading={scraping} variant="accent" />
        <ActionBtn label="Start Emails" onClick={doEmail} loading={emailing} />
        <ActionBtn
          label={callsEnabled ? "Open Calls Workspace" : "Calls Setup"}
          onClick={doCalls}
          loading={calling}
        />
        <ActionBtn label="Generate Today's Post" onClick={doGeneratePost} loading={generating} />
      </div>

      {latestPost && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Latest Generated Post</h3>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted">{latestPost.market}</span>
          </div>
          <p className="whitespace-pre-line text-sm text-gray-200">{latestPost.caption}</p>
          <p className="text-xs text-accent">{latestPost.cta}</p>
          <div className="flex flex-wrap gap-1">
            {(latestPost.hashtags || []).map((tag: string) => (
              <span key={tag} className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted">
                #{tag}
              </span>
            ))}
          </div>
          <div className="border-t border-border pt-2">
            <p className="mb-1 text-xs font-medium text-muted">Image prompt:</p>
            <p className="text-xs italic text-gray-400">{latestPost.image_prompt}</p>
          </div>
        </div>
      )}

      {scrapeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 space-y-5 rounded-2xl border border-border bg-surface p-8">
            <h3 className="text-lg font-bold text-white">Start Scrape</h3>
            <div>
              <label className="mb-1 block text-xs text-muted">Market</label>
              <select
                value={scrapeMarket}
                onChange={event => setScrapeMarket(event.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="dubai">Dubai</option>
                <option value="uk">UK</option>
                <option value="us">US</option>
                <option value="all">All markets</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Lead Type</label>
              <select
                value={scrapeType}
                onChange={event => setScrapeType(event.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white"
              >
                <option value="agency">Agency</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setScrapeModal(false)}
                className="flex-1 rounded-lg border border-border py-2 text-sm text-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={doScrape}
                className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black hover:bg-yellow-400"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-border bg-surface px-5 py-3 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
