/**
 * Records the microphone straight to a 16 kHz mono WAV file in the browser.
 * WAV (not WebM) because Twilio can only play MP3 and WAV into a voicemail.
 */
export class WavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private rate = 44100;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext();
    this.rate = this.ctx.sampleRate;
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (e) => this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  async stop(): Promise<{ blob: Blob; seconds: number }> {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    const length = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(length);
    let offset = 0;
    for (const c of this.chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    const target = 16000;
    const ratio = this.rate / target;
    const out = new Int16Array(Math.floor(all.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const s = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return { blob: encodeWav(out, target), seconds: out.length / target };
  }
}

function encodeWav(samples: Int16Array, rate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: "audio/wav" });
}
