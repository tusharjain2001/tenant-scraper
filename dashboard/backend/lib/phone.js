const E164_REGEX = /^\+[1-9]\d{7,14}$/;

function sanitizeOutboundNumber(input) {
  if (typeof input !== "string") {
    return { ok: false, error: "Enter a phone number in international format, for example +14155550123." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a phone number to place a call." };
  }

  const normalized = trimmed
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .replace(/(?!^)\+/g, "");

  if (!E164_REGEX.test(normalized)) {
    return {
      ok: false,
      error: "Enter a valid phone number with a country code, for example +14155550123.",
    };
  }

  return { ok: true, e164: normalized };
}

function maskPhoneNumber(value) {
  if (!value) return "unknown";

  const digits = String(value).replace(/\D/g, "");
  if (digits.length <= 4) return `••${digits}`;

  const prefix = value.trim().startsWith("+") ? "+" : "";
  return `${prefix}${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

module.exports = {
  sanitizeOutboundNumber,
  maskPhoneNumber,
};
