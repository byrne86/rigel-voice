import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "./supabase/admin";
import { isTwilioRecordingUrl } from "./twilio";
import type { Criterion, ScoreResult, Utterance } from "./types";

const MIN_SECONDS = Number(process.env.MIN_SCORING_SECONDS ?? 20);

/**
 * Full pipeline for one recorded call:
 * Twilio recording -> Deepgram transcript -> Claude scorecard -> saved to Supabase.
 */
export async function processCall(callId: string) {
  const db = createAdminClient();
  const { data: call } = await db
    .from("calls")
    .select("*, campaigns(name, script, scorecard_template_id, call_language, feedback_language, ai_context, script_flow, script_objections, script_status)")
    .eq("id", callId)
    .single();
  if (!call || (!call.recording_url && !call.recording_storage_path)) return;

  const setStatus = (processing_status: string, processing_error: string | null = null) =>
    db.from("calls").update({ processing_status, processing_error }).eq("id", callId);

  try {
    if (call.recording_duration !== null && call.recording_duration < MIN_SECONDS) {
      await setStatus("skipped", `Recording shorter than ${MIN_SECONDS}s`);
      return;
    }

    // 1. Transcribe
    await setStatus("transcribing");
    const audio = call.recording_storage_path
      ? await downloadUpload(call.recording_storage_path)
      : { data: await downloadRecording(call.recording_url), type: "audio/mpeg" };
    const utterances = await transcribe(audio.data, audio.type, call.campaigns?.call_language);
    const text = utterances.map((u) => `[${stamp(u.start)}] ${u.speaker}: ${u.text}`).join("\n");
    await db.from("transcripts").upsert({
      call_id: callId,
      org_id: call.org_id,
      text,
      utterances,
      provider: "deepgram",
    });
    if (!text.trim()) {
      await setStatus("skipped", "No speech detected");
      return;
    }
    // A voicemail a customer left us is transcribed but not scored.
    if (call.disposition === "voicemail_received") {
      await setStatus("done");
      return;
    }

    // 2. Score
    const templateId = call.campaigns?.scorecard_template_id;
    let template = null;
    if (templateId) {
      template = (await db.from("scorecard_templates").select("*").eq("id", templateId).single()).data;
    }
    if (!template) {
      template = (
        await db
          .from("scorecard_templates")
          .select("*")
          .eq("org_id", call.org_id)
          .order("created_at")
          .limit(1)
          .maybeSingle()
      ).data;
    }
    if (!template || !Array.isArray(template.criteria) || template.criteria.length === 0) {
      await setStatus("done", "Transcribed. No scorecard template to score against.");
      return;
    }

    await setStatus("scoring");
    const criteria = template.criteria as Criterion[];
    const c = call.campaigns;
    const approved = c?.script_status === "approved";
    const scored = await scoreTranscript(text, criteria, {
      campaign: c?.name,
      context: c?.ai_context,
      script: approved ? c?.script : null,
      flow: approved ? (c?.script_flow as string[] | null) : null,
      objections: approved ? (c?.script_objections as { objection: string; answer: string }[] | null) : null,
      feedbackLanguage: c?.feedback_language,
    });

    // A call passes when it reaches the pass mark and no critical criterion got under half marks.
    const passMark = Number(template.pass_mark ?? 70);
    const criticalFail = scored.results.some((r) => {
      const c = criteria.find((x) => x.id === r.criterion_id);
      return c?.critical && r.score < r.max_points / 2;
    });
    await db.from("scorecards").upsert(
      {
        call_id: callId,
        org_id: call.org_id,
        template_id: template.id,
        ...scored,
        passed: scored.percent >= passMark && !criticalFail,
        agent_talk_ratio: talkRatio(utterances),
      },
      { onConflict: "call_id" },
    );
    await setStatus("done");
  } catch (err) {
    console.error("processCall failed", callId, err);
    await setStatus("failed", err instanceof Error ? err.message.slice(0, 500) : "Unknown error");
  }
}

async function downloadRecording(recordingUrl: string) {
  if (!isTwilioRecordingUrl(recordingUrl)) throw new Error("Recording URL is not a Twilio URL");
  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const res = await fetch(`${recordingUrl}.mp3`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`Could not download recording (${res.status})`);
  return await res.arrayBuffer();
}

/** A recording a manager uploaded, from the private storage bucket. */
async function downloadUpload(path: string) {
  const { data, error } = await createAdminClient().storage.from("recordings").download(path);
  if (error || !data) throw new Error(`Could not read the uploaded recording: ${error?.message ?? "missing"}`);
  return { data: await data.arrayBuffer(), type: data.type || "audio/mpeg" };
}

/** Dual-channel recording: channel 0 is the agent's leg, channel 1 is the customer. */
async function transcribe(audio: ArrayBuffer, contentType = "audio/mpeg", language?: string | null): Promise<Utterance[]> {
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL ?? "nova-3",
    language: language || process.env.DEEPGRAM_LANGUAGE || "en",
    smart_format: "true",
    multichannel: "true",
    utterances: "true",
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": contentType,
    },
    body: audio,
  });
  if (!res.ok) throw new Error(`Deepgram error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const raw: { start: number; end: number; channel: number; transcript: string }[] =
    json?.results?.utterances ?? [];
  const channelCount = json?.metadata?.channels ?? 1;
  return raw
    .filter((u) => u.transcript?.trim())
    .sort((a, b) => a.start - b.start)
    .map((u) => ({
      speaker: channelCount < 2 ? "Speaker" : u.channel === 0 ? "Agent" : "Customer",
      start: u.start,
      end: u.end,
      text: u.transcript.trim(),
    }));
}

async function scoreTranscript(
  transcript: string,
  criteria: Criterion[],
  context: {
    campaign?: string | null;
    context?: string | null;
    script?: string | null;
    flow?: string[] | null;
    objections?: { objection: string; answer: string }[] | null;
    feedbackLanguage?: string | null;
  },
) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

  const criteriaText = criteria
    .map((c) => `- id "${c.id}" | ${c.name}${c.critical ? " (CRITICAL)" : ""} | max ${c.max_points} points | ${c.description}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system:
      "You are a contact-centre quality assurance analyst. You score call transcripts against a scorecard, " +
      "fairly and consistently. Base every score only on what is in the transcript. Quote short evidence " +
      "from the call for each criterion. If a criterion could not apply to this call, award full points and " +
      "say why. Transcripts are machine-generated and may contain small errors; do not penalise the agent for those.",
    tools: [
      {
        name: "submit_scorecard",
        description: "Record the completed scorecard for this call.",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2-4 sentence summary of the call and its outcome." },
            sentiment: {
              type: "string",
              enum: ["positive", "neutral", "negative"],
              description: "The customer's overall sentiment.",
            },
            results: {
              type: "array",
              description: "One entry per scorecard criterion, in the same order.",
              items: {
                type: "object",
                properties: {
                  criterion_id: { type: "string" },
                  score: { type: "number", description: "Points awarded, from 0 up to the criterion's max." },
                  evidence: { type: "string", description: "Short quote or moment from the call." },
                  comment: { type: "string", description: "One sentence explaining the score." },
                },
                required: ["criterion_id", "score", "evidence", "comment"],
              },
            },
            coaching: {
              type: "array",
              items: { type: "string" },
              description: "Up to 3 specific, practical coaching tips for the agent.",
            },
            objections: {
              type: "array",
              description:
                "Every objection the customer raised. Empty if none.",
              items: {
                type: "object",
                properties: {
                  objection: {
                    type: "string",
                    description:
                      "Short, general label of 3-7 words so similar objections group together, e.g. 'Too expensive', 'Already have a supplier', 'Call back next month'.",
                  },
                  category: { type: "string", enum: ["price", "timing", "need", "authority", "competitor", "trust", "other"] },
                  resolved: { type: "boolean", description: "True if the agent handled it and the customer moved on positively." },
                },
                required: ["objection", "category", "resolved"],
              },
            },
            compliance_flags: {
              type: "array",
              items: { type: "string" },
              description:
                "Any compliance concerns, e.g. no recording notice, ignoring a do-not-call request, misleading claims. Empty if none.",
            },
          },
          required: ["summary", "sentiment", "results", "coaching", "objections", "compliance_flags"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_scorecard" },
    messages: [
      {
        role: "user",
        content:
          `Campaign: ${context.campaign ?? "n/a"}\n\n` +
          (context.context ? `About this campaign (client, what they sell, who we call, a good outcome):\n${context.context}\n\n` : "") +
          (context.script ? `Approved agent script:\n${context.script}\n\n` : "") +
          (context.flow?.length ? `Expected call flow:\n${context.flow.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` : "") +
          (context.objections?.length
            ? `Approved objection answers:\n${context.objections.map((o) => `- "${o.objection}": ${o.answer}`).join("\n")}\n\n`
            : "") +
          `Write the summary in English. Write each comment and the coaching tips in ${languageName(context.feedbackLanguage)}. ` +
          "Keep quoted evidence in the language it was spoken, with an English translation in brackets if it is not English.\n\n" +
          `Scorecard criteria:\n${criteriaText}\n\n` +
          `Call transcript:\n<transcript>\n${transcript.slice(0, 150_000)}\n</transcript>\n\n` +
          "Score this call against every criterion.",
      },
    ],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return a scorecard");
  const out = block.input as {
    summary: string;
    sentiment: string;
    results: { criterion_id: string; score: number; evidence: string; comment: string }[];
    coaching: string[];
    objections: { objection: string; category: string; resolved: boolean }[];
    compliance_flags: string[];
  };

  // Totals are computed here, not by the model, and scores are clamped to each criterion's range.
  const results: ScoreResult[] = criteria.map((c) => {
    const r = out.results?.find((x) => x.criterion_id === c.id);
    const score = Math.max(0, Math.min(c.max_points, Number(r?.score ?? 0)));
    return {
      criterion_id: c.id,
      name: c.name,
      max_points: c.max_points,
      score,
      evidence: r?.evidence ?? "",
      comment: r?.comment ?? "Not scored",
    };
  });
  const total_score = results.reduce((s, r) => s + r.score, 0);
  const max_score = results.reduce((s, r) => s + r.max_points, 0);

  return {
    total_score,
    max_score,
    percent: max_score ? Math.round((total_score / max_score) * 1000) / 10 : 0,
    summary: out.summary ?? "",
    sentiment: out.sentiment ?? "neutral",
    results,
    coaching: out.coaching ?? [],
    objections: (out.objections ?? []).slice(0, 20).map((o) => ({
      objection: String(o.objection ?? "").slice(0, 120),
      category: String(o.category ?? "other"),
      resolved: !!o.resolved,
    })),
    compliance_flags: out.compliance_flags ?? [],
    model,
  };
}

/** Share of speaking time that was the agent (0-1), from the two-channel transcript. */
function talkRatio(utterances: Utterance[]) {
  let agent = 0;
  let customer = 0;
  for (const u of utterances) {
    const d = Math.max(0, u.end - u.start);
    if (u.speaker === "Agent") agent += d;
    else if (u.speaker === "Customer") customer += d;
  }
  return agent + customer > 0 ? Math.round((agent / (agent + customer)) * 1000) / 1000 : null;
}

function languageName(code?: string | null) {
  const names: Record<string, string> = { en: "English", ga: "Irish", fr: "French", de: "German", es: "Spanish", it: "Italian", nl: "Dutch", pl: "Polish", pt: "Portuguese" };
  return names[code ?? "en"] ?? "English";
}

function stamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
