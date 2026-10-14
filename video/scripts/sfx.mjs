// Effets sonores et nappe musicale synthétisés (aucun échantillon externe, donc libres de droits).
//   node scripts/sfx.mjs  →  public/sfx/*.wav (44,1 kHz, 16 bits, mono)
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 44100;
const OUT = new URL("../public/sfx/", import.meta.url);
mkdirSync(OUT, { recursive: true });

function wav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(new URL(name, OUT), Buffer.concat([h, data]));
  console.log(name, (samples.length / SR).toFixed(2), "s");
}

// Bruit pseudo-aléatoire déterministe (rendu reproductible).
let seed = 12345;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const buf = (sec) => new Float64Array(Math.round(sec * SR));

/** Filtre passe-bande simple (biquad) à fréquence variable. */
function bandpass(input, freqAt, q = 1.2) {
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const w = (2 * Math.PI * freqAt(i / SR)) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
    const y = (b0 * input[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = input[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

// Souffle : bruit filtré dont la fréquence balaye vers le haut puis retombe.
{
  const d = 0.7;
  const n = buf(d).map(() => noise());
  const f = bandpass(n, (t) => 300 + 4200 * Math.sin((Math.PI * t) / d));
  wav("whoosh.wav", Array.from(f, (v, i) => v * Math.sin((Math.PI * i) / f.length) ** 1.5 * 2.2));
}

// Impact : chute de fréquence grave + clic de bruit, décroissance exponentielle.
{
  const d = 1.1;
  const s = buf(d);
  let phase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 40 + 110 * Math.exp(-t * 9);
    phase += (2 * Math.PI * f) / SR;
    s[i] = Math.sin(phase) * Math.exp(-t * 3.2) * 1.0 + noise() * Math.exp(-t * 40) * 0.5;
  }
  wav("impact.wav", Array.from(s));
}

// Pop : courte note brillante.
{
  const d = 0.18;
  const s = buf(d);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = (Math.sin(2 * Math.PI * 880 * t) * 0.6 + Math.sin(2 * Math.PI * 1760 * t) * 0.25) * Math.exp(-t * 28);
  }
  wav("pop.wav", Array.from(s));
}

// Montée : bruit + glissando qui accélère jusqu'au point culminant.
{
  const d = 1.6;
  const n = buf(d).map(() => noise());
  const f = bandpass(n, (t) => 400 + 6000 * (t / d) ** 2, 2);
  let phase = 0;
  wav(
    "riser.wav",
    Array.from(f, (v, i) => {
      const t = i / SR;
      phase += (2 * Math.PI * (200 + 900 * (t / d) ** 2)) / SR;
      const env = (t / d) ** 2;
      return (v * 1.6 + Math.sin(phase) * 0.25) * env;
    }),
  );
}

// Nappe musicale : accords (La m – Fa – Do – Sol) en sinus désaccordés + pulsation douce, 100 BPM.
{
  const bpm = 100;
  const beat = 60 / bpm;
  const d = 34;
  const s = buf(d);
  const note = (m) => 440 * 2 ** ((m - 69) / 12);
  const chords = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [48, 55, 60, 64],
    [55, 59, 62, 67],
  ];
  const bar = beat * 4;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const ci = Math.floor(t / (bar * 2)) % chords.length;
    const local = (t % (bar * 2)) / (bar * 2);
    const env = Math.min(1, local * 6) * Math.min(1, (1 - local) * 6);
    let v = 0;
    for (const m of chords[ci]) {
      const f = note(m);
      v += Math.sin(2 * Math.PI * f * t) * 0.12 + Math.sin(2 * Math.PI * f * 1.003 * t) * 0.08 + Math.sin(2 * Math.PI * f * 2 * t) * 0.025;
    }
    v *= env;
    // Pulsation grave sur chaque temps + souffle aigu sur les contretemps.
    const tb = t % beat;
    v += Math.sin(2 * Math.PI * (45 + 60 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 9) * 0.55;
    const off = (t + beat / 2) % beat;
    v += noise() * Math.exp(-off * 60) * 0.06;
    // Fondu d'entrée et de sortie.
    v *= Math.min(1, t / 1.5) * Math.min(1, (d - t) / 2.5);
    s[i] = v;
  }
  wav("music.wav", Array.from(s));
}
