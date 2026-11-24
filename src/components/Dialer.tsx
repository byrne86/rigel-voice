"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { contactName, DISPOSITIONS, formatDuration, type Campaign, type CallList, type Contact, type VoicemailDrop } from "@/lib/types";

type Phase = "idle" | "loading" | "dialing" | "live" | "wrapup" | "finished";
type Mode = "manual" | "list";
interface Current {
  callId: string;
  number: string;
  contact: Partial<Contact> | null;
  inbound?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export default function Dialer({
  me,
  campaigns,
  lists,
  drops,
  initialCampaignId,
  initialListId,
}: {
  me: { id: string; name: string };
  campaigns: Campaign[];
  lists: (CallList & { ready: number })[];
  drops: VoicemailDrop[];
  initialCampaignId?: string;
  initialListId?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialListId ? "list" : "manual");
  const [campaignId, setCampaignId] = useState(
    campaigns.find((c) => c.id === initialCampaignId)?.id ??
      lists.find((l) => l.id === initialListId)?.campaign_id ??
      campaigns[0]?.id ??
      "",
  );
  const campaignLists = lists.filter((l) => l.campaign_id === campaignId);
  const [listId, setListId] = useState(initialListId ?? campaignLists[0]?.id ?? "");
  const campaign = campaigns.find((c) => c.id === campaignId);
  const callerId = campaign?.caller_id || "your default number";

  const [number, setNumber] = useState("");
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [incoming, setIncoming] = useState<Call | null>(null);
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [reachedDm, setReachedDm] = useState(false);
  const [dropped, setDropped] = useState<string | null>(null);
  const [dropChoice, setDropChoice] = useState("");
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(0);

  // Your own message for this campaign first, then your others, then shared ones.
  const offered = drops
    .filter((d) => !d.campaign_id || d.campaign_id === campaignId)
    .sort((a, b) => rank(a) - rank(b));
  function rank(d: VoicemailDrop) {
    const mine = d.owner_id === me.id;
    const forCampaign = d.campaign_id === campaignId;
    return (mine ? 0 : 2) + (forCampaign ? 0 : 1);
  }
  const selectedDrop = dropChoice || offered[0]?.id || "";
  const canDrop = campaign?.allow_voicemail_drops !== false && offered.length > 0;
  const script = campaign?.script_status === "approved" ? campaign : null;

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const wasLive = useRef(false);

  // Browser phone: makes calls and receives callbacks.
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
        device.on("incoming", (call: Call) => {
          if (callRef.current) {
            call.reject();
            return;
          }
          setIncoming(call);
          const clear = () => setIncoming((c) => (c === call ? null : c));
          call.on("cancel", clear);
          call.on("disconnect", clear);
        });
        await device.register();
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

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  function resetCallState() {
    setError(null);
    setCountdown(null);
    setSeconds(0);
    setMuted(false);
    setDropped(null);
    setDropChoice("");
    setReachedDm(false);
    setDisposition("");
    setNotes("");
    setCallbackAt("");
    setChecked({});
    wasLive.current = false;
  }

  function wire(call: Call) {
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
  }

  async function startCall(url: string, body: object) {
    const device = deviceRef.current;
    if (!device) return;
    resetCallState();
    setPhase("loading");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start the call");
      if (url.endsWith("/next") && !json.contact) {
        setCurrent(null);
        setPhase("finished");
        return;
      }
      setCurrent({ callId: json.callId, number: json.to ?? json.contact.phone, contact: json.contact ?? null });
      setPhase("dialing");
      wire(await device.connect({ params: { callId: json.callId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
      setPhase((p) => (p === "dialing" ? "wrapup" : "idle"));
    }
  }

  const dialNext = useCallback(() => startCall("/api/dialer/next", { listId }), [listId]); // eslint-disable-line react-hooks/exhaustive-deps

  function dialManual(e?: React.FormEvent) {
    e?.preventDefault();
    if (!number.trim()) return setError("Type a number to call");
    void startCall("/api/dialer/manual", { campaignId, number });
  }

  function answer() {
    const call = incoming;
    if (!call) return;
    resetCallState();
    setIncoming(null);
    const params = call.customParameters;
    setCurrent({
      callId: params.get("callId") ?? "",
      number: call.parameters.From ?? "",
      contact: { first_name: params.get("contactName") ?? call.parameters.From },
      inbound: true,
    });
    wire(call);
    call.accept();
  }

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

  async function markReachedDm() {
    if (!current || reachedDm) return;
    setReachedDm(true);
    const res = await fetch(`/api/calls/${current.callId}/reached-dm`, { method: "POST" });
    if (!res.ok) setReachedDm(false);
  }

  async function voicemailDrop() {
    if (!current || dropped || phase !== "live") return;
    const res = await fetch(`/api/calls/${current.callId}/voicemail-drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: selectedDrop || null }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not drop voicemail");
    setDropped(json.drop ?? "Voicemail");
    setDisposition("voicemail");
  }

  // Keyboard shortcuts: R = through to decision maker, V = drop voicemail.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((phase === "wrapup" || phase === "live") && /^[1-9]$/.test(e.key)) {
        const d = DISPOSITIONS[Number(e.key) - 1];
        if (d) setDisposition(d.value);
        return;
      }
      if (phase === "wrapup" && e.key === "Enter" && disposition) {
        void saveOutcome();
        return;
      }
      if (phase !== "live") return;
      if (e.key === "r" || e.key === "R") void markReachedDm();
      if ((e.key === "v" || e.key === "V") && canDrop) void voicemailDrop();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function saveOutcome() {
    if (!current || !disposition) return;
    setSaving(true);
    const res = await fetch(`/api/calls/${current.callId}/disposition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disposition, notes, callbackAt: callbackAt ? new Date(callbackAt).toISOString() : null }),
    });
    setSaving(false);
    if (!res.ok) return setError((await res.json()).error ?? "Could not save the outcome");
    setDone((d) => d + 1);
    const wasList = mode === "list" && !current.inbound;
    setCurrent(null);
    setPhase("idle");
    setNumber("");
    if (wasList && auto) setCountdown(3);
  }

  const inCall = phase === "dialing" || phase === "live";
  const busy = inCall || phase === "wrapup" || phase === "loading" || countdown !== null;
  const status =
    phase === "loading" ? "Connecting"
    : phase === "dialing" ? "Ringing"
    : phase === "live" ? "On the call"
    : phase === "wrapup" ? "Call ended"
    : phase === "finished" ? "This list is done for now"
    : countdown !== null ? `Next call in ${countdown}`
    : ready ? "Ready" : "Starting your phone";
  const step = phase === "wrapup" ? 3 : reachedDm ? 2 : inCall ? 1 : 0;
  const display = current ? (current.contact ? contactName({ ...current.contact, phone: current.number }) : current.number) : number;

  function press(k: string) {
    if (phase === "live") callRef.current?.sendDigits(k);
    else if (!busy && mode === "manual") setNumber((n) => n + k);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {incoming && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-flare/40 bg-flare/10 p-4" role="alert">
            <div>
              <div className="text-sm text-amber-900">Someone is calling back</div>
              <div className="font-display text-xl font-bold text-night">{incoming.customParameters.get("contactName") || incoming.parameters.From}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn bg-good hover:brightness-110" onClick={answer}>Answer</button>
              <button className="btn-secondary" onClick={() => { incoming.reject(); setIncoming(null); }}>Decline</button>
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl bg-night text-white shadow-[0_20px_50px_-20px_rgba(18,26,51,.6)]" aria-label="Call console">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/40 text-sm font-semibold">
              {me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="mr-auto">
              <div className="text-sm font-semibold">{me.name}</div>
              <div className="text-xs text-slate-400">Calling from {callerId}</div>
            </div>
            <label className="sr-only" htmlFor="campaign">Campaign</label>
            <select id="campaign" disabled={busy} value={campaignId}
              className="rounded-[10px] border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-flare [&>option]:text-night"
              onChange={(e) => { setCampaignId(e.target.value); setListId(lists.find((l) => l.campaign_id === e.target.value)?.id ?? ""); }}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="px-6 pb-6 pt-5">
            <div className="inline-flex rounded-full bg-white/[0.06] p-1" role="tablist" aria-label="How you want to dial">
              {(["manual", "list"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} disabled={busy}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === m ? "bg-white text-night" : "text-slate-300 hover:text-white"}`}
                  onClick={() => setMode(m)}>
                  {m === "manual" ? "Type a number" : "Work a list"}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2 text-sm" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${phase === "live" ? "bg-good [animation:live-dot_1.2s_ease-in-out_infinite]" : phase === "dialing" ? "bg-flare" : ready ? "bg-slate-400" : "bg-flare"}`} />
              <span className="text-slate-300">{status}</span>
              {(inCall || phase === "wrapup") && <span className="font-display ml-auto text-lg font-semibold tabular-nums">{formatDuration(seconds)}</span>}
            </div>

            {mode === "manual" || current ? (
              <form onSubmit={dialManual}>
                <label className="sr-only" htmlFor="number">Number to call</label>
                <input id="number" inputMode="tel" autoComplete="off" readOnly={busy}
                  className="font-display mt-2 w-full bg-transparent text-[34px] font-semibold tracking-tight text-white outline-none placeholder:text-slate-600"
                  placeholder="087 123 4567" value={display} onChange={(e) => setNumber(e.target.value)} />
                {current?.contact?.company && <div className="-mt-1 text-sm text-slate-400">{current.contact.company} · {current.number}</div>}
                {!current && (
                  <div className="mt-1 text-xs text-slate-500">
                    A leading 0 is read as {campaign?.default_country === "GB" ? "a UK" : campaign?.default_country === "IE" ? "an Irish" : `a ${campaign?.default_country}`} number. They see {callerId}.
                  </div>
                )}
              </form>
            ) : (
              <div className="mt-3">
                {campaignLists.length === 0 ? (
                  <p className="text-sm text-slate-400">This campaign has no lists yet. Add one under Call lists.</p>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="list">Call list</label>
                    <select id="list" disabled={busy} value={listId} onChange={(e) => setListId(e.target.value)}
                      className="font-display w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xl font-semibold text-white outline-none focus:border-flare [&>option]:text-night [&>option]:text-base">
                      {campaignLists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.ready} to call)</option>)}
                    </select>
                    <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm text-slate-300">
                      <button type="button" role="switch" aria-checked={auto} onClick={() => { setAuto(!auto); if (auto) setCountdown(null); }}
                        className={`relative h-6 w-11 rounded-full transition ${auto ? "bg-good" : "bg-white/20"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${auto ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      Ring the next person as soon as I save an outcome
                    </label>
                  </>
                )}
              </div>
            )}

            <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-6">
              <div className="grid max-w-[260px] grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <button key={k} type="button" onClick={() => press(k)} disabled={!(phase === "live" || (!busy && mode === "manual"))}
                    className="font-display h-11 rounded-xl bg-white/[0.06] text-lg font-semibold text-white transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-30">
                    {k}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-2 pb-1">
                {inCall ? (
                  <>
                    <button type="button" aria-label="Hang up" onClick={() => callRef.current?.disconnect()}
                      className={`flex h-[72px] w-[72px] items-center justify-center rounded-full bg-bad text-white transition hover:brightness-110 active:scale-95 ${phase === "dialing" ? "[animation:ring-pulse_1.4s_ease-out_infinite]" : ""}`}>
                      <svg viewBox="0 0 24 24" className="h-8 w-8 rotate-[135deg]" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" /></svg>
                    </button>
                    <button type="button" className="text-xs text-slate-300 hover:text-white disabled:opacity-40" disabled={phase !== "live"}
                      onClick={() => { callRef.current?.mute(!muted); setMuted(!muted); }}>
                      {muted ? "Unmute" : "Mute"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" aria-label={mode === "manual" ? "Call" : "Start dialling the list"}
                      disabled={!ready || busy || (mode === "manual" ? !campaignId : !listId)}
                      onClick={() => (mode === "manual" ? dialManual() : dialNext())}
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-good text-white shadow-[0_10px_30px_-8px_rgba(14,143,106,.7)] transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none">
                      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" /></svg>
                    </button>
                    <span className="text-xs text-slate-400">{countdown !== null ? <button className="underline" onClick={() => setCountdown(null)}>Pause</button> : mode === "manual" ? "Call" : done ? "Next" : "Start"}</span>
                  </>
                )}
              </div>
            </div>
            {error && <p className="mt-4 rounded-xl bg-bad/20 px-3 py-2 text-sm text-red-100">{error}</p>}
          </div>
        </section>

        {current && (phase === "wrapup" || phase === "live") && (
          <section className="card" aria-label="Outcome">
            {current.contact?.notes && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{current.contact.notes}</p>}
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-night">How did it go?</h2>
              <span className="text-xs text-slate-500">Press 1–9 to pick, Enter to save</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DISPOSITIONS.map((d, i) => (
                <button key={d.value} onClick={() => setDisposition(d.value)} aria-pressed={disposition === d.value}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition active:scale-[.98] ${
                    disposition === d.value ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand/50"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs ${disposition === d.value ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
                  {d.label}
                </button>
              ))}
            </div>
            {disposition === "callback" && (
              <div className="mt-3">
                <label className="label" htmlFor="cb">When should we ring back?</label>
                <input id="cb" type="datetime-local" className="input w-auto" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
              </div>
            )}
            <textarea className="input mt-3 min-h-20" placeholder="Anything worth remembering about this call" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {phase === "wrapup" && (
              <button className="btn mt-3" disabled={!disposition || saving} onClick={saveOutcome}>
                {saving ? "Saving…" : mode === "list" && auto && !current.inbound ? "Save and ring the next person" : "Save outcome"}
              </button>
            )}
          </section>
        )}
      </div>

      <div className="space-y-5">
        <section className="card">
          <h2 className="text-lg font-bold text-night">Call progress</h2>
          <ol className="mt-4 space-y-0">
            {[
              { t: "Getting through", d: "Ask for the person you need. Nothing to press yet." },
              { t: "Decision maker", d: "Read the recording notice, then mark it." },
              { t: "Wrap up", d: "Pick an outcome and add a note." },
            ].map((s2, i) => {
              const n = i + 1;
              const state = step > n ? "done" : step === n ? "now" : "next";
              return (
                <li key={s2.t} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < 2 && <span className={`absolute left-[13px] top-8 h-[calc(100%-28px)] w-px ${step > n ? "bg-good" : "bg-slate-200"}`} />}
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    state === "done" ? "bg-good text-white" : state === "now" ? "bg-flare text-night ring-4 ring-flare/25" : "bg-slate-100 text-slate-500"}`}>
                    {state === "done" ? "✓" : n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${state === "next" ? "text-slate-500" : "text-night"}`}>{s2.t}</div>
                    <div className="text-sm text-slate-500">{s2.d}</div>
                    {n === 2 && (
                      <div className="mt-3">
                        {campaign?.recording_disclosure && (
                          <blockquote className="rounded-xl border-l-4 border-flare bg-amber-50/60 px-4 py-3 text-[15px] text-slate-800">
                            {campaign.recording_disclosure}
                          </blockquote>
                        )}
                        <button className="btn mt-3 w-full" disabled={phase !== "live" || reachedDm} onClick={markReachedDm}>
                          {reachedDm ? "Marked as decision maker" : "I'm through to the decision maker"}
                          {!reachedDm && <kbd className="rounded bg-white/20 px-1.5 text-xs">R</kbd>}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {canDrop && (
          <section className="card">
            <h2 className="text-lg font-bold text-night">Answering machine?</h2>
            <p className="text-sm text-slate-500">Wait for the tone, then leave a message and move on.</p>
            <label className="sr-only" htmlFor="drop">Message to leave</label>
            <select id="drop" className="input mt-3" value={selectedDrop} disabled={!!dropped} onChange={(e) => setDropChoice(e.target.value)}>
              {offered.map((d) => <option key={d.id} value={d.id}>{d.name}{d.owner_id === me.id ? " (yours)" : " (team)"}</option>)}
            </select>
            <button className="btn-secondary mt-3 w-full" disabled={phase !== "live" || !!dropped} onClick={voicemailDrop}>
              {dropped ? `Left “${dropped}”` : "Leave this message"}
              {!dropped && <kbd className="rounded bg-slate-100 px-1.5 text-xs">V</kbd>}
            </button>
          </section>
        )}

        {script && (script.script_flow?.length > 0 || script.script_objections?.length > 0 || script.script) && (
          <section className="card">
            <h2 className="text-lg font-bold text-night">Your script</h2>
            {script.script_flow?.length > 0 && (
              <ul className="mt-3 space-y-1">
                {script.script_flow.map((stepText, i) => (
                  <li key={i}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 ${checked[i] ? "text-slate-400" : "text-slate-800"}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#0e8f6a]" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                      <span className={checked[i] ? "line-through" : ""}>{stepText}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {script.script && (
              <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700">Full wording</summary>
                <p className="mt-2 whitespace-pre-wrap text-slate-700">{script.script}</p>
              </details>
            )}
            {script.script_objections?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-700">When they push back</h3>
                {script.script_objections.map((o, i) => (
                  <details key={i} className="group mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm open:border-brand/40 open:bg-brand/[0.03]">
                    <summary className="cursor-pointer font-medium text-night">“{o.objection}”</summary>
                    <p className="mt-1.5 text-slate-700">{o.answer}</p>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
