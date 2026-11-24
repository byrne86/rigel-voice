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
    phase === "loading" ? "Connecting…"
    : phase === "dialing" ? "Ringing…"
    : phase === "live" ? `Live · ${formatDuration(seconds)}`
    : phase === "wrapup" ? `Call ended · ${formatDuration(seconds)}`
    : phase === "finished" ? "Nothing left to call in this list right now"
    : countdown !== null ? `Next call in ${countdown}…`
    : ready ? "Ready" : "Starting phone…";

  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-3">
        {incoming && (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-emerald-300 bg-emerald-50" role="alert">
            <div>
              <div className="text-sm text-emerald-800">Incoming call</div>
              <div className="text-lg font-semibold">{incoming.customParameters.get("contactName") || incoming.parameters.From}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn bg-emerald-600 hover:bg-emerald-700" onClick={answer}>Answer</button>
              <button className="btn-secondary" onClick={() => { incoming.reject(); setIncoming(null); }}>Decline</button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">You</div>
              <div className="input bg-slate-50">{me.name}</div>
            </div>
            <div>
              <label className="label" htmlFor="campaign">Campaign</label>
              <select id="campaign" className="input" value={campaignId} disabled={busy}
                onChange={(e) => { setCampaignId(e.target.value); setListId(lists.find((l) => l.campaign_id === e.target.value)?.id ?? ""); }}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500">Calling from {callerId}</p>
            </div>
          </div>

          <div className="mt-5 inline-flex rounded-lg border border-slate-200 p-1" role="tablist">
            {(["manual", "list"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} disabled={busy}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                onClick={() => setMode(m)}>
                {m === "manual" ? "Dial a number" : "Work a call list"}
              </button>
            ))}
          </div>

          {mode === "manual" ? (
            <form onSubmit={dialManual} className="mt-4">
              <label className="label" htmlFor="number">Number</label>
              <input id="number" className="input text-base" inputMode="tel" autoComplete="off" disabled={busy}
                placeholder="087 123 4567 or +44…" value={number} onChange={(e) => setNumber(e.target.value)} />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Numbers starting 0 are treated as {campaign?.default_country === "GB" ? "UK" : campaign?.default_country === "IE" ? "Irish" : campaign?.default_country}</span>
                <span>Shows as {callerId}</span>
              </div>
              <button className="btn mt-4 w-full bg-emerald-600 py-3 text-base hover:bg-emerald-700" disabled={!ready || busy || !campaignId}>
                Call
              </button>
            </form>
          ) : (
            <div className="mt-4">
              <label className="label" htmlFor="list">Call list</label>
              {campaignLists.length === 0 ? (
                <p className="text-sm text-slate-500">No call lists for this campaign yet. Create one under Call lists.</p>
              ) : (
                <>
                  <select id="list" className="input" value={listId} disabled={busy} onChange={(e) => setListId(e.target.value)}>
                    {campaignLists.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.ready} ready</option>)}
                  </select>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) setCountdown(null); }} />
                    Dial the next person as soon as I log the outcome
                  </label>
                  <button className="btn mt-4 w-full bg-emerald-600 py-3 text-base hover:bg-emerald-700" disabled={!ready || busy || !listId} onClick={dialNext}>
                    {done ? "Next call" : "Start power dialling"}
                  </button>
                  {countdown !== null && <button className="btn-secondary mt-2 w-full" onClick={() => setCountdown(null)}>Pause</button>}
                </>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 text-sm font-medium" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "live" ? "bg-emerald-500" : ready ? "bg-slate-400" : "bg-amber-400"}`} />
            {status}
            <span className="ml-auto text-xs font-normal text-slate-500">{done} calls this session</span>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {current && (inCall || phase === "wrapup") && (
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold">{current.contact ? contactName({ ...current.contact, phone: current.number }) : current.number}</div>
                <div className="text-sm text-slate-600">
                  {[current.contact?.company, current.number].filter(Boolean).join(" · ")}
                  {current.inbound && " · incoming"}
                </div>
              </div>
              {inCall && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => { callRef.current?.mute(!muted); setMuted(!muted); }} disabled={phase !== "live"}>
                    {muted ? "Unmute" : "Mute"}
                  </button>
                  <button className="btn-danger" onClick={() => callRef.current?.disconnect()}>Hang up</button>
                </div>
              )}
            </div>
            {current.contact?.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{current.contact.notes}</p>}
            {phase === "live" && (
              <div className="mt-4 grid w-44 grid-cols-3 gap-1.5">
                {KEYS.map((k) => (
                  <button key={k} className="btn-secondary px-0" onClick={() => callRef.current?.sendDigits(k)}>{k}</button>
                ))}
              </div>
            )}

            {(phase === "wrapup" || phase === "live") && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="label">Outcome</div>
                <div className="flex flex-wrap gap-2">
                  {DISPOSITIONS.map((d) => (
                    <button key={d.value} onClick={() => setDisposition(d.value)} aria-pressed={disposition === d.value}
                      className={`rounded-full border px-3 py-1.5 text-sm ${disposition === d.value ? "border-brand bg-indigo-50 font-medium text-brand" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {disposition === "callback" && (
                  <div className="mt-3">
                    <label className="label" htmlFor="cb">Call back at</label>
                    <input id="cb" type="datetime-local" className="input w-auto" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
                  </div>
                )}
                <textarea className="input mt-3 min-h-20" placeholder="Notes" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                {phase === "wrapup" && (
                  <button className="btn mt-3" disabled={!disposition || saving} onClick={saveOutcome}>
                    {saving ? "Saving…" : mode === "list" && auto && !current.inbound ? "Save and dial next" : "Save outcome"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-5 xl:col-span-2">
        <section className="card">
          <h2 className="font-semibold">When you reach the decision maker</h2>
          {campaign?.recording_disclosure && (
            <>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Say</div>
              <blockquote className="mt-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">“{campaign.recording_disclosure}”</blockquote>
            </>
          )}
          <button className="btn mt-4 w-full" disabled={phase !== "live" || reachedDm} onClick={markReachedDm}>
            {reachedDm ? "Marked: through to decision maker" : "Through to decision maker"}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">Counts towards “reached DM” in reports · shortcut R</p>
        </section>

        {canDrop && (
          <section className="card">
            <h2 className="font-semibold">Got voicemail?</h2>
            <label className="sr-only" htmlFor="drop">Voicemail to leave</label>
            <select id="drop" className="input mt-3" value={selectedDrop} disabled={!!dropped} onChange={(e) => setDropChoice(e.target.value)}>
              {offered.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.owner_id === me.id ? " (yours)" : " (shared)"}</option>
              ))}
            </select>
            <button className="btn-secondary mt-3 w-full" disabled={phase !== "live" || !!dropped} onClick={voicemailDrop}>
              {dropped ? `Left: ${dropped}` : "Drop voicemail"}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">Wait for the beep, then click · shortcut V</p>
          </section>
        )}

        {script && (script.script_flow?.length > 0 || script.script_objections?.length > 0 || script.script) && (
          <section className="card">
            <h2 className="font-semibold">Call flow</h2>
            {script.script_flow?.length > 0 && (
              <ul className="mt-3 space-y-2">
                {script.script_flow.map((step, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                      <span className={checked[i] ? "text-slate-400 line-through" : ""}>{step}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {script.script && <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-700">{script.script}</p>}
            {script.script_objections?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold">If they say…</h3>
                {script.script_objections.map((o, i) => (
                  <details key={i} className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium">{o.objection}</summary>
                    <p className="mt-1 text-slate-700">{o.answer}</p>
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
