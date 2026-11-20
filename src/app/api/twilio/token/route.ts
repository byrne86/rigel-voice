import twilio from "twilio";
import { CALLING_DISABLED, callingEnabled, getContext } from "@/lib/auth";

/** Short-lived token that lets the signed-in agent's browser place calls through Twilio. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  if (!(await callingEnabled(ctx.profile.org_id))) {
    return Response.json({ error: CALLING_DISABLED }, { status: 403 });
  }

  const { AccessToken } = twilio.jwt;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { identity: ctx.user.id, ttl: 3600 },
  );
  token.addGrant(
    new AccessToken.VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID!,
      incomingAllow: false,
    }),
  );
  return Response.json({ token: token.toJwt() });
}
