import { useEffect, useState, useCallback } from "react";
import * as api from "../api";
import type { Lead, EmailSequence } from "../types";

const STATUS_COLORS: Record<string, string> = {
  pending:      "bg-gray-700 text-gray-300",
  active:       "bg-blue-900 text-blue-300",
  done:         "bg-green-900 text-green-300",
  replied:      "bg-purple-900 text-purple-300",
  bounced:      "bg-red-900 text-red-300",
  unsubscribed: "bg-yellow-900 text-yellow-300",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || "bg-gray-700 text-gray-300"}`}>
      {status}
    </span>
  );
}

function DetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const seqs: EmailSequence[] = lead.email_sequences || [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-white text-lg">{lead.agency_name || lead.owner_name}</h3>
            <p className="text-muted text-sm">{lead.email}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Market",       lead.market],
            ["Lead type",    lead.lead_type],
            ["City",         lead.city],
            ["Phone",        lead.phone_raw],
            ["Source",       lead.source],
            ["Lead status",  lead.lead_status],
            ["Sequence",     lead.sequence_status],
            ["First mail",   lead.mail_sent_at ? new Date(lead.mail_sent_at).toLocaleDateString() : "—"],
            ["Last call",    lead.last_call_outcome || "—"],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="text-muted text-xs">{label}</p>
              <p className="text-white font-medium">{val || "—"}</p>
            </div>
          ))}
        </div>

        {lead.website || lead.listing_url ? (
          <a href={lead.website || lead.listing_url} target="_blank" rel="noopener noreferrer"
             className="text-accent text-xs hover:underline block truncate">
            {lead.website || lead.listing_url}
          </a>
        ) : null}

        {/* Email timeline */}
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Email Timeline</h4>
          {seqs.length === 0 ? (
            <p className="text-muted text-sm">No emails sent yet</p>
          ) : (
            <div className="space-y-2">
              {seqs.map(s => (
                <div key={s.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 w-6 h-6 rounded-full bg-white/5 border border-border flex items-center justify-center text-xs text-muted shrink-0">
                    {s.sequence_step}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white truncate">{s.subject}</p>
                    <p className="text-muted text-xs">
                      {new Date(s.sent_at).toLocaleString()}
                      {s.open_count > 0 && <span className="ml-2 text-green-400">· {s.open_count} open{s.open_count > 1 ? "s" : ""}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Call summary */}
        {lead.last_call_summary && (
          <div>
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Latest Call</h4>
            <div className="bg-bg border border-border rounded-lg p-3 text-sm text-gray-300">
              <p className="font-medium text-white mb-1">Outcome: {lead.last_call_outcome}</p>
              <p>{lead.last_call_summary}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Lead | null>(null);
  const [filters, setFilters]     = useState({
    market: "", lead_type: "", lead_status: "", search: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: "50" };
      if (filters.market)      params.market      = filters.market;
      if (filters.lead_type)   params.lead_type   = filters.lead_type;
      if (filters.lead_status) params.lead_status = filters.lead_status;
      if (filters.search)      params.search      = filters.search;

      const r = await api.getLeads(params);
      setLeads(r.items || []);
      setTotal(r.pagination?.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: string, val: string) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: val }));
  };

  const openDetail = async (lead: Lead) => {
    const r = await api.getLead(lead.id);
    setSelected(r.lead);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-muted text-sm">{total.toLocaleString()} total</p>
        </div>
        <button
          onClick={() => api.exportCsv(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))}
          className="px-4 py-2 bg-white/5 border border-border text-sm text-white rounded-lg hover:bg-white/10"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { key: "market",      opts: ["", "dubai", "uk", "us"],                            label: "Market" },
          { key: "lead_type",   opts: ["", "agency", "owner"],                              label: "Type" },
          { key: "lead_status", opts: ["", "pending", "active", "done", "replied", "bounced", "unsubscribed"], label: "Status" },
        ].map(({ key, opts, label }) => (
          <select
            key={key}
            value={(filters as any)[key]}
            onChange={e => setFilter(key, e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">{label}: All</option>
            {opts.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input
          type="text"
          placeholder="Search name, email, city…"
          value={filters.search}
          onChange={e => setFilter("search", e.target.value)}
          className="flex-1 min-w-48 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted"
        />
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                {["Agency / Owner", "Email", "Phone", "City", "Market", "Type", "Status", "Sequence", "Mail sent"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted">Loading…</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted">No leads found</td></tr>
              ) : leads.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => openDetail(lead)}
                  className="border-b border-border hover:bg-white/3 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white max-w-44 truncate">{lead.agency_name || lead.owner_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-44 truncate">{lead.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{lead.phone_raw || "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{lead.city || "—"}</td>
                  <td className="px-4 py-3 uppercase text-xs text-muted">{lead.market}</td>
                  <td className="px-4 py-3 text-xs text-muted">{lead.lead_type}</td>
                  <td className="px-4 py-3"><Badge status={lead.lead_status} /></td>
                  <td className="px-4 py-3 text-xs text-muted">{lead.sequence_status}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {lead.mail_sent_at ? new Date(lead.mail_sent_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-muted text-xs">Page {page} of {Math.ceil(total / 50)}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border border-border rounded text-sm text-white disabled:opacity-30">Prev</button>
              <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border border-border rounded text-sm text-white disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {selected && <DetailPanel lead={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
