import twilio from "twilio";

export function baseUrl() {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error("APP_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

export function twilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

/**
 * Reads a Twilio webhook's form body and checks its signature, so nobody else
 * can post fake call events. Returns null when the signature is invalid.
 */
export async function readTwilioWebhook(req: Request): Promise<Record<string, string> | null> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = typeof value === "string" ? value : "";
  });
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = new URL(req.url);
  const fullUrl = `${baseUrl()}${url.pathname}${url.search}`;
  const ok = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, signature, fullUrl, params);
  return ok ? params : null;
}

export function twiml(response: { toString(): string }) {
  return new Response(response.toString(), { headers: { "Content-Type": "text/xml" } });
}

export const VoiceResponse = twilio.twiml.VoiceResponse;

/** Fills {{first_name}}, {{last_name}} and {{company}} placeholders in a spoken message. */
export function personalise(
  message: string,
  contact: { first_name?: string | null; last_name?: string | null; company?: string | null } | null,
) {
  return message
    .replace(/\{\{\s*first_name\s*\}\}/gi, contact?.first_name ?? "")
    .replace(/\{\{\s*last_name\s*\}\}/gi, contact?.last_name ?? "")
    .replace(/\{\{\s*company\s*\}\}/gi, contact?.company ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
