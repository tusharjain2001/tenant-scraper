const BASE = "/api";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res  = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const json = await res.json();
  if (!json.ok && res.status >= 400) throw new Error(json.error || "Request failed");
  return json as T;
}

// ── Summary ───────────────────────────────────────────────────────────────────
export const getSummary = () => req<any>("/dashboard/summary");

// ── Leads ─────────────────────────────────────────────────────────────────────
export const getLeads = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  return req<any>(`/leads${qs ? "?" + qs : ""}`);
};
export const getLead    = (id: string) => req<any>(`/leads/${id}`);
export const exportCsv  = (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString();
  window.open(`/api/leads/export/csv${qs ? "?" + qs : ""}`, "_blank");
};

// ── Scrape ────────────────────────────────────────────────────────────────────
export const startScrape = (market: string, lead_type: string, csv_path?: string) =>
  req<any>("/scrape/run", { method: "POST", body: JSON.stringify({ market, lead_type, csv_path }) });
export const getScrapeRuns = () => req<any>("/scrape/runs");

// ── Email ─────────────────────────────────────────────────────────────────────
export const startEmail  = (step?: number) =>
  req<any>("/email/start", { method: "POST", body: JSON.stringify({ step }) });
export const getEmailStatus = () => req<any>("/email/status");

// ── Calls ─────────────────────────────────────────────────────────────────────
export const queueCalls  = (market: string, limit: number) =>
  req<any>("/calls/queue", { method: "POST", body: JSON.stringify({ market, limit }) });
export const getCallStatus = () => req<any>("/calls/status");

// ── Content ───────────────────────────────────────────────────────────────────
export const generatePost   = (market: string, theme?: string) =>
  req<any>("/content/generate-today", { method: "POST", body: JSON.stringify({ market, theme }) });
export const getContentHistory = (market?: string) =>
  req<any>(`/content/history${market ? "?market=" + market : ""}`);
