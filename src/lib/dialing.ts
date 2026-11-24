import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Cleans a typed number to international format. Numbers starting 0 use the campaign's country. */
export function normaliseNumber(raw: string, country = "IE") {
  const parsed = parsePhoneNumberFromString(String(raw ?? "").trim(), country as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  // Block premium-rate and shared-cost numbers, which can cost a fortune per minute.
  const type = parsed.getType();
  if (type === "PREMIUM_RATE" || type === "SHARED_COST") return null;
  return parsed.number as string;
}
