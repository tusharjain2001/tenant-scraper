const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function sanitizeDialNumber(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return { ok: false as const, error: "Enter a phone number to place a call." };
  }

  const normalized = trimmed
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .replace(/(?!^)\+/g, "");

  if (!E164_REGEX.test(normalized)) {
    return {
      ok: false as const,
      error: "Enter a valid number with a country code, for example +14155550123.",
    };
  }

  return { ok: true as const, e164: normalized };
}

export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return "No number";
  return value.replace(/(\+\d{1,3})(\d{3})(\d+)(\d{2})$/, "$1 $2 $3 $4");
}
