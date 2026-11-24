"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { contactName, DISPOSITIONS, formatDuration, type Campaign, type Contact, type VoicemailDrop } from "@/lib/types";

type Phase = "idle" | "loading" | "dialing" | "live" | "wrapup" | "finished";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function Dialer({
  campaigns,
  drops,
  initialCampaignId,
}: {
  campaigns: Campaign[];
  drops: VoicemailDrop[];
  initialCampaignId?: string;
}) {
  const [campaignId, setCampaignId] = useState(
    campaigns.find((c) => c.id === initialCampaignId)?.id ?? campaigns[0]?.id ?? "",
  );
  const campaign = campaigns.find((c) => c.id === campaignId);

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<{ contact: Contact; callId: string } | null>(null);
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [dropped, setDropped] = useState<string | null>(null);
  const [dropChoice, setDropChoice] = useState("");
  const defaultDropId = campaign?.voicemail_drop_id ?? drops.find((d) => d.is_default)?.id ?? "";
  const selectedDrop = dropChoice || defaultDropId;
  const [done, setDone] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const wasLive = useRef(false);

  // Set up the browser phone once.
  useEffect(() => {
    let cancelled = false;
    const getToken = async () => {
      const res = await fetch("/api/twilio/token");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not get a phone token");
      return json.token as string;
    };
    (async () => {
      try {
        const token = await getToken();
        const { Device } = await import("@twilio/voice-sdk");
        if (cancelled) return;
        const device = new Device(token, { closeProtection: true });
        device.on("tokenWillExpire", async () => {
          try {
            device.updateToken(await getToken());
          } catch {
            /* the next call will surface the problem */
          }
        });
        device.on("error", (e: { message: string }) => setError(e.message));
        deviceRef.current = device;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start the phone");
      }
    })();
    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  // Call timer.
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const dialNext = useCallback(async () => {
    const device = deviceRef.current;
    if (!device || !campaignId) return;
    setError(null);
    setCountdown(null);
    setPhase("loading");
    setSeconds(0);
    setMuted(false);
    setDropped(null);
    setDropChoice("");
    setDisposition("");
    setNotes("");
    setCallbackAt("");
    wasLive.current = false;

    try {
      const res = await fetch("/api/dialer/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not get the next contact");
      if (!json.contact) {
        setCurrent(null);
        setPhase("finished");
        return;
      }
      setCurrent({ contact: json.contact, callId: json.callId });
      setPhase("dialing");

      const call = await device.connect({ params: { callId: json.callId } });
      callRef.current = call;
      const ended = () => {
        if (callRef.current !== call) return;
        callRef.current = null;
        setDisposition((d) => d || (wasLive.current ? "" : "no_answer"));
        setPhase("wrapup");
      };
      call.on("accept", () => {
        wasLive.current = true;
        setPhase("live");
      });
      call.on("disconnect", ended);
      call.on("cancel", ended);
      call.on("error", (e: { message: string }) => {
        setError(e.message);
        ended();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
      setPhase((p) => (p === "dialing" ? "wrapup" : "idle"));
    }
  }, [campaignId]);

  // Auto-dial countdown between calls.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void dialNext();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, dialNext]);

  function hangUp() {
    callRef.current?.disconnect();
  }

  function toggleMute() {
    const call = callRef.current;
    if (!call) return;
    call.mute(!muted);
    setMuted(!muted);
  }

  async function voicemailDrop() {
    if (!current) return;
    const res = await fetch(`/api/calls/${current.callId}/voicemail-drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: selectedDrop || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not drop voicemail");
      return;
    }
    setDropped(json.drop ?? "Voicemail");
    setDisposition("voicemail");
  }

  async function saveOutcome() {
    if (!current || !disposition) return;
    setSaving(true);
    const res = await fetch(`/api/calls/${current.callId}/disposition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disposition,
        notes,
        callbackAt: callbackAt ? new Date(callbackAt).toISOString() : null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save the outcome");
      return;
    }
    setDone((d) => d + 1);
    setCurrent(null);
    setPhase("idle");
    if (auto) setCountdown(3);
  }

  if (campaigns.length === 0) {
    return (
      <div className="card text-sm text-slate-600">
        There are no active agent campaigns. Create one under Campaigns and set its status to Active.
      </div>
    );
  }

  const inCall = phase === "dialing" || phase === "live";
  const sessionBusy = inCall || phase === "wrapup" || phase === "loading" || countdown !== null;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <div className="card">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="label">Campaign</label>
              <select className="input" value={campaignId} disabled={sessionBusy} onChange={(e) => setCampaignId(e.target.value)}>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) setCountdown(null); }} />
              Auto-dial next
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${ready ? "bg-green-500" : "bg-amber-400"}`} />
            <span className="text-slate-600">{ready ? "Phone ready" : "Starting phone…"}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{done} calls this session</span>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="card">
          {phase === "idle" && countdown === null && (
            <div className="py-6 text-center">
              <button className="btn px-8 py-3 text-base" disabled={!ready} onClick={dialNext}>
                {done === 0 ? "Start dialing" : "Next call"}
              </button>
              <p className="mt-3 text-xs text-slate-500">Your browser will ask to use the microphone. A headset is recommended.</p>
            </div>
          )}

          {countdown !== null && (
            <div className="py-6 text-center">
              <div className="text-sm text-slate-500">Next call in</div>
              <div className="text-4xl font-semibold">{countdown}</div>
              <button className="btn-secondary mt-4" onClick={() => setCountdown(null)}>Pause</button>
            </div>
          )}

          {phase === "loading" && <div className="py-8 text-center text-sm text-slate-500">Finding the next contact…</div>}

          {phase === "finished" && (
            <div className="py-8 text-center">
              <div className="text-lg font-semibold">Nothing left to call right now</div>
              <p className="mt-1 text-sm text-slate-500">Every contact is done or waiting for its retry time.</p>
              <button className="btn-secondary mt-4" onClick={() => setPhase("idle")}>OK</button>
            </div>
          )}

          {current && (inCall || phase === "wrapup") && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold">{contactName(current.contact)}</div>
                  <div className="text-sm text-slate-600">
                    {[current.contact.company, current.contact.phone].filter(Boolean).join(" · ")}
                  </div>
                  {current.contact.email && <div className="text-sm text-slate-500">{current.contact.email}</div>}
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${phase === "live" ? "text-green-600" : "text-slate-500"}`}>
                    {phase === "dialing" ? "Ringing…" : phase === "live" ? "Live" : "Call ended"}
                  </div>
                  <div className="font-mono text-2xl">{formatDuration(seconds)}</div>
                </div>
              </div>
              {current.contact.notes && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{current.contact.notes}</p>
              )}

              {inCall && (
                <>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button className="btn-danger" onClick={hangUp}>Hang up</button>
                    <button className="btn-secondary" onClick={toggleMute} disabled={phase !== "live"}>
                      {muted ? "Unmute" : "Mute"}
                    </button>
                    {drops.length > 0 && (
                      <div className="flex items-center gap-1">
                        <label className="sr-only" htmlFor="drop-choice">Voicemail to leave</label>
                        <select
                          id="drop-choice"
                          className="input w-auto py-2"
                          value={selectedDrop}
                          disabled={!!dropped}
                          onChange={(e) => setDropChoice(e.target.value)}
                        >
                          {drops.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <button className="btn-secondary" onClick={voicemailDrop} disabled={phase !== "live" || !!dropped}>
                          {dropped ? `Left: ${dropped}` : "Drop voicemail"}
                        </button>
                      </div>
                    )}
                  </div>
                  {phase === "live" && (
                    <div className="mt-4 grid w-44 grid-cols-3 gap-1.5">
                      {KEYS.map((k) => (
                        <button key={k} className="btn-secondary px-0" onClick={() => callRef.current?.sendDigits(k)}>{k}</button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {(phase === "wrapup" || phase === "live") && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="label">Outcome</div>
                  <div className="flex flex-wrap gap-2">
                    {DISPOSITIONS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDisposition(d.value)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          disposition === d.value
                            ? "border-brand bg-indigo-50 font-medium text-brand"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {disposition === "callback" && (
                    <div className="mt-3">
                      <label className="label">Call back at</label>
                      <input type="datetime-local" className="input w-auto" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
                    </div>
                  )}
                  <textarea className="input mt-3 min-h-20" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  {phase === "wrapup" && (
                    <button className="btn mt-3" disabled={!disposition || saving} onClick={saveOutcome}>
                      {saving ? "Saving…" : auto ? "Save and dial next" : "Save outcome"}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card h-fit lg:col-span-2">
        <h3 className="font-semibold">Script</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {campaign?.script || "No script has been added to this campaign."}
        </p>
      </div>
    </div>
  );
}
