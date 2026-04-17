import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Device } from "@twilio/voice-sdk";
import { Link, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { formatPhoneDisplay, sanitizeDialNumber } from "../lib/phone";
import type { CallHistoryItem, CallStatus, CallUiState, Lead } from "../types";

const CALL_STATES: CallUiState[] = [
  "idle",
  "requesting access",
  "ready",
  "connecting",
  "ringing",
  "in-call",
  "ending",
  "ended",
  "failed",
];

const STATE_STYLES: Record<CallUiState, string> = {
  idle: "bg-white/5 text-muted border border-border",
  "requesting access": "bg-blue-950/60 text-blue-200 border border-blue-800",
  ready: "bg-emerald-950/60 text-emerald-200 border border-emerald-800",
  connecting: "bg-amber-950/60 text-amber-200 border border-amber-800",
  ringing: "bg-sky-950/60 text-sky-200 border border-sky-800",
  "in-call": "bg-green-950/70 text-green-200 border border-green-700",
  ending: "bg-orange-950/70 text-orange-200 border border-orange-700",
  ended: "bg-white/5 text-gray-300 border border-border",
  failed: "bg-red-950/60 text-red-200 border border-red-800",
};

const DIAL_KEYS = [
  { value: "1", letters: "" },
  { value: "2", letters: "ABC" },
  { value: "3", letters: "DEF" },
  { value: "4", letters: "GHI" },
  { value: "5", letters: "JKL" },
  { value: "6", letters: "MNO" },
  { value: "7", letters: "PQRS" },
  { value: "8", letters: "TUV" },
  { value: "9", letters: "WXYZ" },
  { value: "+", letters: "Intl" },
  { value: "0", letters: "+" },
  { value: "00", letters: "Intl" },
];

function getOrCreateIdentity() {
  const storageKey = "prophives-call-identity";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now()}`;
  const identity = `dashboard-${suffix}`;
  window.localStorage.setItem(storageKey, identity);
  return identity;
}

function StateBadge({ state }: { state: CallUiState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATE_STYLES[state]}`}>
      {state}
    </span>
  );
}

function LeadCard({
  lead,
  active,
  onSelect,
}: {
  lead: Lead;
  active: boolean;
  onSelect: (lead: Lead) => void;
}) {
  const label = lead.agency_name || lead.owner_name || "Unnamed lead";
  const phone = lead.phone_e164 || lead.phone_raw;

  return (
    <button
      type="button"
      onClick={() => onSelect(lead)}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        active
          ? "border-accent/60 bg-accent/10"
          : "border-border bg-surface hover:border-white/10 hover:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{label}</p>
          <p className="truncate text-xs text-muted">{lead.city || "Unknown city"} | {lead.market.toUpperCase()}</p>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] uppercase text-muted">{lead.lead_type}</span>
      </div>
      <p className="mt-3 text-sm text-gray-300">{formatPhoneDisplay(phone)}</p>
      <p className="mt-1 truncate text-xs text-muted">{lead.email || "No email"}</p>
    </button>
  );
}

function HistoryCard({
  item,
  onRedial,
}: {
  item: CallHistoryItem;
  onRedial: (phone: string | null) => void;
}) {
  const label = item.leads?.agency_name || item.leads?.owner_name || "Manual dial";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{label}</p>
          <p className="truncate text-xs text-muted">{formatPhoneDisplay(item.phone_e164)} | {item.status || item.outcome || "pending"}</p>
        </div>
        <button
          type="button"
          onClick={() => onRedial(item.phone_e164)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs text-white hover:bg-white/5"
        >
          Redial
        </button>
      </div>
      {item.summary && <p className="mt-3 text-sm text-gray-300">{item.summary}</p>}
      <p className="mt-2 text-xs text-muted">
        {new Date(item.called_at).toLocaleString()}
        {item.duration_seconds ? ` | ${item.duration_seconds}s` : ""}
      </p>
    </div>
  );
}

export default function CallsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [callState, setCallState] = useState<CallUiState>("idle");
  const [callStatus, setCallStatus] = useState<CallStatus | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);
  const [historyItems, setHistoryItems] = useState<CallHistoryItem[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [dialValue, setDialValue] = useState("");
  const [validationError, setValidationError] = useState("");
  const [adminError, setAdminError] = useState("");
  const [infoMessage, setInfoMessage] = useState("Select a lead or enter a number to start a browser call.");
  const [isMuted, setIsMuted] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const deferredLeadSearch = useDeferredValue(leadSearch);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const deviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);
  const identityRef = useRef<string>("");
  const isCallingRef = useRef(false);

  useEffect(() => {
    identityRef.current = getOrCreateIdentity();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function loadCallStatus() {
    try {
      const response = await api.getCallStatus();
      setCallStatus(response);
      if (!response.configured && response.errors?.length) {
        setAdminError(response.errors.join(" "));
      }
    } catch (error: any) {
      setAdminError(error.message || "Unable to load Twilio call configuration.");
    }
  }

  async function loadLeads(search = "") {
    setLoadingList(true);
    try {
      const response = await api.getLeads({
        page: "1",
        page_size: "12",
        ...(search ? { search } : {}),
      });
      const withPhones = (response.items || []).filter((lead: Lead) => Boolean(lead.phone_e164 || lead.phone_raw));
      setLeadResults(withPhones);
    } catch (error: any) {
      setAdminError(error.message || "Unable to load leads for calling.");
    }
    setLoadingList(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const response = await api.getCallHistory({ limit: "10" });
      setHistoryItems(response.items || []);
    } catch (error: any) {
      setAdminError(error.message || "Unable to load recent calls.");
    }
    setLoadingHistory(false);
  }

  useEffect(() => {
    loadCallStatus();
    loadLeads();
    loadHistory();
  }, []);

  useEffect(() => {
    loadLeads(deferredLeadSearch);
  }, [deferredLeadSearch]);

  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (!leadId) return;

    api.getLead(leadId)
      .then(response => {
        const lead = response.lead as Lead;
        setSelectedLead(lead);
        setDialValue(lead.phone_e164 || lead.phone_raw || "");
        setValidationError("");
        setInfoMessage(`Ready to call ${lead.agency_name || lead.owner_name || "this lead"}.`);
      })
      .catch((error: any) => setAdminError(error.message || "Unable to load the selected lead."));
  }, [searchParams]);

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setDialValue(lead.phone_e164 || lead.phone_raw || "");
    setValidationError("");
    setInfoMessage(`Ready to call ${lead.agency_name || lead.owner_name || "this lead"}.`);
    setSearchParams({ leadId: lead.id });
    inputRef.current?.focus();
  }

  function appendDigit(value: string) {
    setDialValue(current => `${current}${value}`);
    setValidationError("");
    inputRef.current?.focus();
  }

  function backspace() {
    setDialValue(current => current.slice(0, -1));
    setValidationError("");
    inputRef.current?.focus();
  }

  function clearNumber() {
    setDialValue("");
    setValidationError("");
    inputRef.current?.focus();
  }

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone access for Twilio Voice.");
    }

    setCallState("requesting access");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  }

  async function ensureDevice() {
    if (deviceRef.current) {
      if (callState === "idle" || callState === "ended" || callState === "failed") {
        setCallState("ready");
      }
      return deviceRef.current;
    }

    await ensureMicrophonePermission();

    const response = await api.getCallToken(identityRef.current);
    const device = new Device(response.token, {
      enableRingingState: true,
      logLevel: 1,
    } as any) as any;

    device.on("error", (error: any) => {
      setAdminError(error.message || "Twilio device error.");
      if (callState !== "in-call") setCallState("failed");
    });

    device.on("tokenWillExpire", async () => {
      try {
        const refreshed = await api.getCallToken(identityRef.current);
        await device.updateToken(refreshed.token);
      } catch (error: any) {
        setAdminError(error.message || "Twilio token refresh failed.");
      }
    });

    device.on("destroyed", () => {
      deviceRef.current = null;
    });

    deviceRef.current = device;
    setCallState("ready");
    setInfoMessage("Microphone access granted. The dialer is ready.");
    return device;
  }

  function bindCallEvents(call: any, destination: string) {
    let finished = false;

    const finalize = (nextState: CallUiState, message: string) => {
      if (finished) return;
      finished = true;
      activeCallRef.current = null;
      setIsMuted(false);
      setCallState(nextState);
      setInfoMessage(message);
      void loadHistory();
    };

    call.on("ringing", () => {
      setCallState("ringing");
      setInfoMessage(`Ringing ${formatPhoneDisplay(destination)}...`);
    });

    call.on("accept", () => {
      setCallState("in-call");
      setInfoMessage(`Connected to ${formatPhoneDisplay(destination)}.`);
    });

    call.on("disconnect", () => {
      finalize("ended", `Call with ${formatPhoneDisplay(destination)} ended.`);
    });

    call.on("cancel", () => {
      finalize("ended", `Call to ${formatPhoneDisplay(destination)} was cancelled.`);
    });

    call.on("reject", () => {
      finalize("failed", `Call to ${formatPhoneDisplay(destination)} was rejected.`);
    });

    call.on("error", (error: any) => {
      setAdminError(error.message || "Twilio call error.");
      finalize("failed", `Call to ${formatPhoneDisplay(destination)} failed.`);
    });
  }

  async function placeCall() {
    if (isCallingRef.current) return;

    const normalized = sanitizeDialNumber(dialValue);
    if (!normalized.ok) {
      setValidationError(normalized.error);
      return;
    }

    if (!callStatus?.configured) {
      setAdminError(callStatus?.errors?.join(" ") || "Twilio calling is not configured.");
      return;
    }

    isCallingRef.current = true;
    setValidationError("");
    setAdminError("");

    try {
      const device = await ensureDevice();
      setCallState("connecting");
      setInfoMessage(`Connecting to ${formatPhoneDisplay(normalized.e164)}...`);

      const call = await device.connect({
        params: {
          to: normalized.e164,
          leadId: selectedLead?.id || "",
          agentIdentity: identityRef.current,
        },
      });

      activeCallRef.current = call;
      bindCallEvents(call, normalized.e164);
    } catch (error: any) {
      setCallState("failed");
      setAdminError(error.message || "Unable to start the call.");
      setInfoMessage("Call setup failed.");
    } finally {
      window.setTimeout(() => {
        isCallingRef.current = false;
      }, 1200);
    }
  }

  function endCall() {
    if (!activeCallRef.current) return;

    setCallState("ending");
    setInfoMessage("Ending call...");

    try {
      activeCallRef.current.disconnect();
    } catch {
      activeCallRef.current = null;
      setCallState("ended");
      setIsMuted(false);
    }
  }

  function toggleMute() {
    if (!activeCallRef.current) return;

    const nextMuted = !isMuted;
    activeCallRef.current.mute(nextMuted);
    setIsMuted(nextMuted);
  }

  function redialNumber(phone: string | null) {
    if (!phone) return;
    setDialValue(phone);
    setValidationError("");
    inputRef.current?.focus();
  }

  useEffect(() => {
    return () => {
      try {
        activeCallRef.current?.disconnect();
      } catch {
        // Best-effort cleanup when leaving the page.
      }

      try {
        deviceRef.current?.destroy();
      } catch {
        // Best-effort cleanup when leaving the page.
      }
    };
  }, []);

  const canStartCall = ["idle", "ready", "ended", "failed"].includes(callState);
  const canManageLiveCall = ["connecting", "ringing", "in-call", "ending"].includes(callState);

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Calls</h1>
          <p className="text-sm text-muted">Browser-based outbound calling with your Twilio number.</p>
        </div>
        <div className="flex items-center gap-3">
          <StateBadge state={callState} />
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
            Caller ID: {callStatus?.caller_id || "Not configured"}
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current Status</p>
          <p className="mt-2 text-sm text-gray-200" aria-live="polite">{infoMessage}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">State Flow</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CALL_STATES.map(state => (
              <span
                key={state}
                className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize ${
                  state === callState
                    ? "bg-accent text-black"
                    : "bg-white/5 text-muted"
                }`}
              >
                {state}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(adminError || callStatus?.errors?.length) && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-100">
          <p className="font-semibold">Calling needs attention</p>
          <p className="mt-1">{adminError || callStatus?.errors.join(" ")}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_400px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Lead Shortlist</h2>
                <p className="mt-1 text-sm text-gray-300">Pick a lead with a phone number to prefill the dialer.</p>
              </div>
              <input
                type="search"
                value={leadSearch}
                onChange={event => setLeadSearch(event.target.value)}
                placeholder="Search leads by name, email, or city"
                className="min-w-60 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white placeholder-muted"
              />
            </div>

            {selectedLead && (
              <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">Selected Lead</p>
                    <p className="mt-1 text-sm font-semibold text-white">{selectedLead.agency_name || selectedLead.owner_name}</p>
                    <p className="mt-1 text-xs text-gray-300">{selectedLead.city || "Unknown city"} | {formatPhoneDisplay(selectedLead.phone_e164 || selectedLead.phone_raw)}</p>
                  </div>
                  <Link
                    to={`/leads`}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-white hover:bg-white/5"
                  >
                    Back to Leads
                  </Link>
                </div>
              </div>
            )}

            {loadingList ? (
              <p className="py-8 text-center text-sm text-muted">Loading callable leads...</p>
            ) : leadResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No leads with phone numbers matched your search.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {leadResults.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    active={selectedLead?.id === lead.id}
                    onSelect={selectLead}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Recent Calls</h2>
                <p className="mt-1 text-sm text-gray-300">Latest direct browser call attempts captured from Twilio callbacks.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadHistory()}
                className="rounded-lg border border-border px-3 py-2 text-xs text-white hover:bg-white/5"
              >
                Refresh
              </button>
            </div>

            {loadingHistory ? (
              <p className="py-8 text-center text-sm text-muted">Loading call history...</p>
            ) : historyItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">No recent calls yet. Your first successful attempt will appear here.</p>
            ) : (
              <div className="space-y-3">
                {historyItems.map(item => (
                  <HistoryCard key={item.id} item={item} onRedial={redialNumber} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Calls Panel</h2>
                <p className="mt-1 text-sm text-gray-300">Direct outbound browser calling powered by Twilio Voice.</p>
              </div>
              <StateBadge state={callState} />
            </div>

            <label htmlFor="dial-number" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
              Phone Number
            </label>
            <div className="rounded-xl border border-border bg-bg p-3">
              <input
                id="dial-number"
                ref={inputRef}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={dialValue}
                onChange={event => {
                  setDialValue(event.target.value);
                  setValidationError("");
                }}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void placeCall();
                  }
                  if (event.key === "Escape") {
                    clearNumber();
                  }
                }}
                placeholder="+14155550123"
                className="w-full bg-transparent text-2xl font-semibold tracking-tight text-white outline-none placeholder:text-muted"
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? "dial-number-error" : undefined}
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={backspace}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-white hover:bg-white/5"
                >
                  Backspace
                </button>
                <button
                  type="button"
                  onClick={clearNumber}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-white hover:bg-white/5"
                >
                  Clear
                </button>
              </div>
            </div>

            {validationError && (
              <p id="dial-number-error" role="alert" className="mt-2 text-sm text-red-300">
                {validationError}
              </p>
            )}

            <div className="mt-5 grid grid-cols-3 gap-3">
              {DIAL_KEYS.map(key => (
                <button
                  key={key.value}
                  type="button"
                  onClick={() => appendDigit(key.value)}
                  className="rounded-xl border border-border bg-bg px-3 py-4 text-center hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <span className="block text-xl font-semibold text-white">{key.value}</span>
                  <span className="block text-[11px] uppercase tracking-wider text-muted">{key.letters || " "}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => void placeCall()}
                disabled={!canStartCall || !callStatus?.configured}
                className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Call
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={endCall}
                  disabled={!canManageLiveCall}
                  className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Hang Up
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={!["ringing", "in-call"].includes(callState)}
                  className="rounded-xl border border-border bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-bg p-4 text-xs text-muted">
              <p className="font-semibold uppercase tracking-wider text-gray-300">Dialer Notes</p>
              <ul className="mt-2 space-y-2">
                <li>The first call asks for microphone access and fetches a short-lived Twilio voice token.</li>
                <li>Enter numbers with a country code to pass validation safely.</li>
                <li>Leaving this page disconnects any active call and tears down the browser voice client.</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
