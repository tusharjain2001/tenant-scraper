import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Device } from "@twilio/voice-sdk";
import { Link, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { formatPhoneDisplay, sanitizeDialNumber } from "../lib/phone";
import type { CallHistoryItem, CallStatus, CallUiState, Lead } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CALL_STATES: CallUiState[] = [
  "idle", "requesting access", "ready", "connecting",
  "ringing", "in-call", "ending", "ended", "failed",
];

const STATE_STYLES: Record<CallUiState, string> = {
  idle:               "bg-white/5 text-muted border border-border",
  "requesting access":"bg-blue-950/60 text-blue-200 border border-blue-800",
  ready:              "bg-emerald-950/60 text-emerald-200 border border-emerald-800",
  connecting:         "bg-amber-950/60 text-amber-200 border border-amber-800",
  ringing:            "bg-sky-950/60 text-sky-200 border border-sky-800",
  "in-call":          "bg-green-950/70 text-green-200 border border-green-700",
  ending:             "bg-orange-950/70 text-orange-200 border border-orange-700",
  ended:              "bg-white/5 text-gray-300 border border-border",
  failed:             "bg-red-950/60 text-red-200 border border-red-800",
};

const DIAL_KEYS = [
  { value: "1", letters: "" },  { value: "2", letters: "ABC" }, { value: "3", letters: "DEF" },
  { value: "4", letters: "GHI" },{ value: "5", letters: "JKL" },{ value: "6", letters: "MNO" },
  { value: "7", letters: "PQRS"},{ value: "8", letters: "TUV" },{ value: "9", letters: "WXYZ" },
  { value: "+", letters: "Intl" },{ value: "0", letters: "+" }, { value: "00", letters: "Intl" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrCreateIdentity() {
  const key = "prophives-call-identity";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `dashboard-${typeof crypto !== "undefined" ? crypto.randomUUID().slice(0, 12) : Date.now()}`;
  window.localStorage.setItem(key, id);
  return id;
}

// ── Small components ──────────────────────────────────────────────────────────

function StateBadge({ state }: { state: CallUiState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATE_STYLES[state]}`}>
      {state}
    </span>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5 border-b border-border pb-4">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function LeadCard({ lead, active, onSelect }: { lead: Lead; active: boolean; onSelect: (l: Lead) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        active ? "border-accent/60 bg-accent/10" : "border-border bg-bg hover:border-white/10 hover:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-white">
          {lead.agency_name || lead.owner_name || "Unnamed"}
        </p>
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-muted">
          {lead.lead_type}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{lead.city || "—"} · {lead.market.toUpperCase()}</p>
      <p className="mt-1.5 text-sm text-gray-300">{formatPhoneDisplay(lead.phone_e164 || lead.phone_raw)}</p>
    </button>
  );
}

function HistoryCard({ item, onRedial }: { item: CallHistoryItem; onRedial: (p: string | null) => void }) {
  const label = item.leads?.agency_name || item.leads?.owner_name || "Manual dial";
  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{label}</p>
          <p className="truncate text-xs text-muted">
            {formatPhoneDisplay(item.phone_e164)} · {item.status || item.outcome || "pending"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRedial(item.phone_e164)}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-white hover:bg-white/5"
        >
          Redial
        </button>
      </div>
      {item.summary && <p className="mt-2 text-sm text-gray-300">{item.summary}</p>}
      <p className="mt-1.5 text-xs text-muted">
        {new Date(item.called_at).toLocaleString()}
        {item.duration_seconds ? ` · ${item.duration_seconds}s` : ""}
      </p>
    </div>
  );
}

// ── Auto-Dial Column ──────────────────────────────────────────────────────────

function AutoDialColumn({ legacyConfigured }: { legacyConfigured: boolean }) {
  const [market, setMarket] = useState("us");
  const [limit, setLimit]   = useState(20);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function startAutoDial() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.queueCalls(market, limit);
      setResult(res.message || `Queued ${res.queued} leads for automated calling.`);
    } catch (err: any) {
      setError(err.message || "Failed to queue calls.");
    }
    setRunning(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 h-full">
      <SectionHeader
        title="Auto-Dial"
        sub="Queue a batch of leads for automated outbound calling via ElevenLabs + n8n."
      />

      {!legacyConfigured && (
        <div className="mb-5 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-xs text-amber-200">
          <p className="font-semibold">Not configured</p>
          <p className="mt-1">Set <code className="text-amber-100">ELEVENLABS_API_KEY</code> and <code className="text-amber-100">N8N_WEBHOOK_URL</code> in the backend <code>.env</code> to enable automated calling.</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Market</label>
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white"
          >
            <option value="dubai">Dubai</option>
            <option value="uk">UK</option>
            <option value="us">US</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
            Leads to call (max)
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white"
          />
        </div>

        <div className="rounded-xl border border-border bg-bg p-4 text-xs text-muted space-y-1.5">
          <p className="font-semibold text-gray-300">How it works</p>
          <p>Picks leads in the selected market that have a phone number and haven't been answered or left a voicemail yet.</p>
          <p>Sends them to your n8n webhook which triggers ElevenLabs AI calls. Results post back via webhook.</p>
        </div>

        <button
          type="button"
          disabled={!legacyConfigured || running}
          onClick={startAutoDial}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Queueing…" : `Start Auto-Dial — ${market.toUpperCase()}`}
        </button>

        {result && (
          <div className="rounded-xl border border-green-800 bg-green-950/30 p-3 text-sm text-green-200">
            {result}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Outcomes tracked</p>
        <div className="grid grid-cols-2 gap-2">
          {["answered", "voicemail", "no_answer", "failed"].map(outcome => (
            <div key={outcome} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted capitalize">
              {outcome.replace("_", " ")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Manual Dial Column ────────────────────────────────────────────────────────

export default function CallsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [callState,    setCallState]    = useState<CallUiState>("idle");
  const [callStatus,   setCallStatus]   = useState<CallStatus | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadResults,  setLeadResults]  = useState<Lead[]>([]);
  const [historyItems, setHistoryItems] = useState<CallHistoryItem[]>([]);
  const [leadSearch,   setLeadSearch]   = useState("");
  const [dialValue,    setDialValue]    = useState("");
  const [validationError, setValidationError] = useState("");
  const [adminError,   setAdminError]   = useState("");
  const [infoMessage,  setInfoMessage]  = useState("Select a lead or enter a number to start a call.");
  const [isMuted,      setIsMuted]      = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const deferredLeadSearch = useDeferredValue(leadSearch);
  const inputRef       = useRef<HTMLInputElement | null>(null);
  const deviceRef      = useRef<any>(null);
  const activeCallRef  = useRef<any>(null);
  const identityRef    = useRef<string>("");
  const isCallingRef   = useRef(false);

  useEffect(() => { identityRef.current = getOrCreateIdentity(); }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function loadCallStatus() {
    try {
      const res = await api.getCallStatus();
      setCallStatus(res);
      if (!res.configured && res.errors?.length) setAdminError(res.errors.join(" "));
    } catch (err: any) {
      setAdminError(err.message || "Unable to load Twilio configuration.");
    }
  }

  async function loadLeads(search = "") {
    setLoadingList(true);
    try {
      const res = await api.getLeads({ page: "1", page_size: "12", ...(search ? { search } : {}) });
      setLeadResults((res.items || []).filter((l: Lead) => Boolean(l.phone_e164 || l.phone_raw)));
    } catch (err: any) {
      setAdminError(err.message || "Unable to load leads.");
    }
    setLoadingList(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api.getCallHistory({ limit: "10" });
      setHistoryItems(res.items || []);
    } catch {
      // silently fail — error already shown from status check
    }
    setLoadingHistory(false);
  }

  useEffect(() => {
    loadCallStatus();
    loadLeads();
    loadHistory();
  }, []);

  useEffect(() => { loadLeads(deferredLeadSearch); }, [deferredLeadSearch]);

  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (!leadId) return;
    api.getLead(leadId)
      .then(res => {
        const lead = res.lead as Lead;
        setSelectedLead(lead);
        setDialValue(lead.phone_e164 || lead.phone_raw || "");
        setInfoMessage(`Ready to call ${lead.agency_name || lead.owner_name || "this lead"}.`);
      })
      .catch((err: any) => setAdminError(err.message));
  }, [searchParams]);

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setDialValue(lead.phone_e164 || lead.phone_raw || "");
    setValidationError("");
    setInfoMessage(`Ready to call ${lead.agency_name || lead.owner_name || "this lead"}.`);
    setSearchParams({ leadId: lead.id });
    inputRef.current?.focus();
  }

  function appendDigit(v: string) { setDialValue(c => `${c}${v}`); setValidationError(""); }
  function backspace()             { setDialValue(c => c.slice(0, -1)); setValidationError(""); }
  function clearNumber()           { setDialValue(""); setValidationError(""); }

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Browser does not support microphone access.");
    setCallState("requesting access");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
  }

  async function ensureDevice() {
    if (deviceRef.current) {
      if (["idle","ended","failed"].includes(callState)) setCallState("ready");
      return deviceRef.current;
    }
    await ensureMicrophonePermission();
    const res = await api.getCallToken(identityRef.current);
    const device = new Device(res.token, { enableRingingState: true, logLevel: 1 } as any) as any;
    device.on("error", (e: any) => { setAdminError(e.message); if (callState !== "in-call") setCallState("failed"); });
    device.on("tokenWillExpire", async () => {
      try { const r = await api.getCallToken(identityRef.current); await device.updateToken(r.token); }
      catch (e: any) { setAdminError(e.message); }
    });
    device.on("destroyed", () => { deviceRef.current = null; });
    deviceRef.current = device;
    setCallState("ready");
    setInfoMessage("Microphone ready. Dialer is active.");
    return device;
  }

  function bindCallEvents(call: any, destination: string) {
    let done = false;
    const finalize = (nextState: CallUiState, msg: string) => {
      if (done) return; done = true;
      activeCallRef.current = null; setIsMuted(false);
      setCallState(nextState); setInfoMessage(msg);
      void loadHistory();
    };
    call.on("ringing",    () => { setCallState("ringing");  setInfoMessage(`Ringing ${formatPhoneDisplay(destination)}…`); });
    call.on("accept",     () => { setCallState("in-call");  setInfoMessage(`Connected to ${formatPhoneDisplay(destination)}.`); });
    call.on("disconnect", () => finalize("ended",  `Call with ${formatPhoneDisplay(destination)} ended.`));
    call.on("cancel",     () => finalize("ended",  `Call to ${formatPhoneDisplay(destination)} cancelled.`));
    call.on("reject",     () => finalize("failed", `Call to ${formatPhoneDisplay(destination)} rejected.`));
    call.on("error",      (e: any) => { setAdminError(e.message); finalize("failed", `Call failed.`); });
  }

  async function placeCall() {
    if (isCallingRef.current) return;
    const normalized = sanitizeDialNumber(dialValue);
    if (!normalized.ok) { setValidationError(normalized.error); return; }
    if (!callStatus?.configured) { setAdminError(callStatus?.errors?.join(" ") || "Twilio not configured."); return; }
    isCallingRef.current = true;
    setValidationError(""); setAdminError("");
    try {
      const device = await ensureDevice();
      setCallState("connecting");
      setInfoMessage(`Connecting to ${formatPhoneDisplay(normalized.e164)}…`);
      const call = await device.connect({ params: { to: normalized.e164, leadId: selectedLead?.id || "", agentIdentity: identityRef.current } });
      activeCallRef.current = call;
      bindCallEvents(call, normalized.e164);
    } catch (err: any) {
      setCallState("failed"); setAdminError(err.message); setInfoMessage("Call setup failed.");
    } finally {
      window.setTimeout(() => { isCallingRef.current = false; }, 1200);
    }
  }

  function endCall() {
    if (!activeCallRef.current) return;
    setCallState("ending"); setInfoMessage("Ending call…");
    try { activeCallRef.current.disconnect(); }
    catch { activeCallRef.current = null; setCallState("ended"); setIsMuted(false); }
  }

  function toggleMute() {
    if (!activeCallRef.current) return;
    const next = !isMuted;
    activeCallRef.current.mute(next);
    setIsMuted(next);
  }

  useEffect(() => {
    return () => {
      try { activeCallRef.current?.disconnect(); } catch {}
      try { deviceRef.current?.destroy(); } catch {}
    };
  }, []);

  const canStartCall    = ["idle","ready","ended","failed"].includes(callState);
  const canManageLive   = ["connecting","ringing","in-call","ending"].includes(callState);
  const legacyConfigured = !!(callStatus as any)?.legacy_queue_configured;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Calls</h1>
          <p className="text-sm text-muted">Two workflows: automated batch dialing and live browser calling.</p>
        </div>
        <div className="flex items-center gap-3">
          <StateBadge state={callState} />
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            Caller ID: {callStatus?.caller_id || "Not configured"}
          </span>
        </div>
      </div>

      {/* Admin error banner */}
      {(adminError || (callStatus?.errors?.length ?? 0) > 0) && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-100">
          <p className="font-semibold">Calling needs attention</p>
          <p className="mt-1">{adminError || callStatus?.errors?.join(" ")}</p>
        </div>
      )}

      {/* Two-column workflow layout */}
      <div className="grid gap-6 xl:grid-cols-2">

        {/* ── Column 1: Auto-Dial ───────────────────────────────────────── */}
        <AutoDialColumn legacyConfigured={legacyConfigured} />

        {/* ── Column 2: Manual Call ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
          <SectionHeader
            title="Manual Call"
            sub="Pick a lead or dial any number directly from your browser using Twilio Voice."
          />

          {/* State flow */}
          <div className="flex flex-wrap gap-2">
            {CALL_STATES.map(s => (
              <span key={s} className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
                s === callState ? "bg-accent text-black" : "bg-white/5 text-muted"
              }`}>{s}</span>
            ))}
          </div>

          {/* Status message */}
          <p className="rounded-xl border border-border bg-bg px-4 py-3 text-sm text-gray-200" aria-live="polite">
            {infoMessage}
          </p>

          {/* Lead search */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Lead Shortlist</p>
              <input
                type="search"
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                placeholder="Search by name, city…"
                className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-white placeholder-muted w-48"
              />
            </div>

            {selectedLead && (
              <div className="mb-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-accent font-semibold uppercase tracking-wider">Selected</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">{selectedLead.agency_name || selectedLead.owner_name}</p>
                    <p className="text-xs text-gray-300">{formatPhoneDisplay(selectedLead.phone_e164 || selectedLead.phone_raw)}</p>
                  </div>
                  <Link to="/leads" className="text-xs text-muted hover:text-white">← Leads</Link>
                </div>
              </div>
            )}

            {loadingList ? (
              <p className="py-4 text-center text-sm text-muted">Loading leads…</p>
            ) : leadResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No leads with phone numbers found.</p>
            ) : (
              <div className="grid gap-2 grid-cols-2 max-h-52 overflow-y-auto pr-1">
                {leadResults.map(lead => (
                  <LeadCard key={lead.id} lead={lead} active={selectedLead?.id === lead.id} onSelect={selectLead} />
                ))}
              </div>
            )}
          </div>

          {/* Dialer */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Phone Number</p>
            <div className="rounded-xl border border-border bg-bg p-3">
              <input
                id="dial-number"
                ref={inputRef}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={dialValue}
                onChange={e => { setDialValue(e.target.value); setValidationError(""); }}
                onKeyDown={e => {
                  if (e.key === "Enter")  { e.preventDefault(); void placeCall(); }
                  if (e.key === "Escape") { clearNumber(); }
                }}
                placeholder="+14155550123"
                className="w-full bg-transparent text-2xl font-semibold tracking-tight text-white outline-none placeholder:text-muted"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={backspace}  className="rounded border border-border px-2.5 py-1 text-xs text-white hover:bg-white/5">⌫</button>
                <button onClick={clearNumber} className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:text-white hover:bg-white/5">Clear</button>
              </div>
            </div>
            {validationError && <p role="alert" className="mt-1.5 text-sm text-red-300">{validationError}</p>}

            <div className="mt-3 grid grid-cols-3 gap-2">
              {DIAL_KEYS.map(k => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => appendDigit(k.value)}
                  className="rounded-xl border border-border bg-bg py-3 text-center hover:bg-white/5"
                >
                  <span className="block text-lg font-semibold text-white">{k.value}</span>
                  <span className="block text-[10px] uppercase tracking-wider text-muted">{k.letters || " "}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => void placeCall()}
                disabled={!canStartCall || !callStatus?.configured}
                className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Call
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={endCall}
                  disabled={!canManageLive}
                  className="rounded-xl border border-red-800 bg-red-950/40 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Hang Up
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={!["ringing","in-call"].includes(callState)}
                  className="rounded-xl border border-border bg-white/5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            </div>
          </div>

          {/* Recent calls */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Recent Calls</p>
              <button onClick={() => void loadHistory()} className="text-xs text-muted hover:text-white">Refresh</button>
            </div>
            {loadingHistory ? (
              <p className="py-4 text-center text-sm text-muted">Loading…</p>
            ) : historyItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No calls yet.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {historyItems.map(item => (
                  <HistoryCard key={item.id} item={item} onRedial={n => { if (n) { setDialValue(n); inputRef.current?.focus(); }}} />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
