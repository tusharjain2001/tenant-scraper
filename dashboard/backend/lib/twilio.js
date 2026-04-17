const twilio = require("twilio");
const { sanitizeOutboundNumber, maskPhoneNumber } = require("./phone");

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

const TOKEN_TTL_SECONDS = 60 * 15;
const FALLBACK_IDENTITY = "dashboard-user";
const IDENTITY_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;

function sanitizeClientIdentity(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return IDENTITY_REGEX.test(raw) ? raw : FALLBACK_IDENTITY;
}

function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    apiKeySid: process.env.TWILIO_API_KEY_SID || "",
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET || "",
    callerId: process.env.TWILIO_PHONE_NUMBER || "",
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID || "",
    backendUrl: (process.env.BACKEND_URL || "").trim().replace(/\/+$/, ""),
  };
}

function getTwilioMissingVars() {
  const config = getTwilioConfig();
  const missing = [];

  if (!config.accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!config.authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!config.apiKeySid) missing.push("TWILIO_API_KEY_SID");
  if (!config.apiKeySecret) missing.push("TWILIO_API_KEY_SECRET");
  if (!config.callerId) missing.push("TWILIO_PHONE_NUMBER");
  if (!config.twimlAppSid) missing.push("TWILIO_TWIML_APP_SID");
  if (!config.backendUrl || !isUsableBackendUrl(config.backendUrl)) missing.push("BACKEND_URL");

  return missing;
}

function isTwilioConfigured() {
  return getTwilioMissingVars().length === 0;
}

function buildPublicUrl(pathname, params = {}) {
  const { backendUrl } = getTwilioConfig();
  const url = new URL(pathname.replace(/^\//, ""), `${backendUrl}/`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function createVoiceToken(identity) {
  const config = getTwilioConfig();
  const token = new AccessToken(
    config.accountSid,
    config.apiKeySid,
    config.apiKeySecret,
    { identity, ttl: TOKEN_TTL_SECONDS }
  );

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: false,
  }));

  return token.toJwt();
}

function isUsableBackendUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.hostname === "replace-me.example.com") return false;
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function createOutboundTwiml({ to, leadId, agentIdentity }) {
  const config = getTwilioConfig();
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const dial = voiceResponse.dial({ answerOnBridge: true, callerId: config.callerId });

  dial.number({
    statusCallback: buildPublicUrl("/api/calls/status-callback", {
      leadId,
      agentIdentity,
    }),
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
  }, to);

  return voiceResponse.toString();
}

function validateTwilioWebhook(req) {
  const config = getTwilioConfig();
  const signature = req.headers["x-twilio-signature"];
  if (!config.authToken || !config.backendUrl || !signature) return false;

  const url = buildPublicUrl(req.originalUrl);
  return twilio.validateRequest(config.authToken, signature, url, req.body || {});
}

function mapCallOutcome({ callStatus, answeredBy }) {
  if (!callStatus) return null;

  if (callStatus === "completed") {
    if (typeof answeredBy === "string" && answeredBy.startsWith("machine")) {
      return "voicemail";
    }
    return "answered";
  }

  if (callStatus === "no-answer") return "no_answer";
  if (["busy", "canceled", "failed"].includes(callStatus)) return "failed";
  return null;
}

function buildCallSummary({ to, outcome, durationSeconds, callStatus, answeredBy, errorMessage }) {
  const destination = maskPhoneNumber(to);
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? `${durationSeconds}s`
    : "0s";

  if (errorMessage) {
    return `Browser call to ${destination} failed: ${errorMessage}`;
  }

  if (outcome === "voicemail") {
    return `Browser call reached voicemail at ${destination}. Duration ${duration}.`;
  }

  if (outcome === "answered") {
    return `Browser call connected to ${destination}. Duration ${duration}.`;
  }

  if (outcome === "no_answer") {
    return `Browser call to ${destination} was not answered.`;
  }

  if (outcome === "failed") {
    return `Browser call to ${destination} failed with status ${callStatus || "unknown"}.`;
  }

  if (answeredBy) {
    return `Browser call update for ${destination}: ${callStatus || answeredBy}.`;
  }

  return `Browser call update for ${destination}: ${callStatus || "pending"}.`;
}

function createAdminClient() {
  const { accountSid, authToken } = getTwilioConfig();
  return twilio(accountSid, authToken);
}

module.exports = {
  TOKEN_TTL_SECONDS,
  buildCallSummary,
  buildPublicUrl,
  createAdminClient,
  createOutboundTwiml,
  createVoiceToken,
  getTwilioConfig,
  getTwilioMissingVars,
  isUsableBackendUrl,
  isTwilioConfigured,
  mapCallOutcome,
  maskPhoneNumber,
  sanitizeClientIdentity,
  sanitizeOutboundNumber,
  validateTwilioWebhook,
};
