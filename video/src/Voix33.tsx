import React from "react";
import type { CSSProperties, ReactNode } from "react";
void React;
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  random,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, fontFamily, gradientText } from "./theme";
import { Background, clamp, IconChat, IconCheck, IconImage, IconPhone, IconPin, Phone, useSpring } from "./ui/kit";
import voice from "./voice.json";

/**
 * Publicité « Gratuit » avec voix off (Windows, voix Hortense) — vertical 1080 × 1920, 33 s.
 * Animations calées sur l'horodatage de chaque mot ; effets sonores et nappe synthétisés (libres de droits).
 * Aucune mention de paiement. Vraies captures et vrais chiffres (233 lieux publiés au 14/10/2026).
 */
export const VOIX_FRAMES = 990;
const FPS = 30;
const BEAT = 18; // 100 BPM à 30 i/s

type Line = { id: string; show: string; file: string; durationMs: number; words: { text: string; ms: number }[] };
const LINES = voice as Line[];

/** Début (image) de chaque phrase de la voix off. */
const START: Record<string, number> = { l1: 12, l2: 150, l3: 195, l4: 300, l5: 420, l6: 530, l7: 640, l8: 800 };
const line = (id: string) => LINES.find((l) => l.id === id)!;
const endOf = (id: string) => START[id]! + Math.ceil((line(id).durationMs / 1000) * FPS);
/** Image à laquelle le n-ième mot prononcé d'une phrase commence. */
const wordAt = (id: string, n: number) => START[id]! + Math.round(((line(id).words[n]?.ms ?? 0) / 1000) * FPS);

const T = (size: number, weight = 800, color: string = C.white): CSSProperties => ({
  fontFamily,
  fontWeight: weight,
  fontSize: size,
  lineHeight: 1.04,
  letterSpacing: "-0.035em",
  color,
  margin: 0,
});

// ------------------------------------------------------------------ effets
/** Pulsation sur le tempo de la musique (0 → 1 à chaque temps, puis décroissance). */
function useBeat() {
  const frame = useCurrentFrame();
  return Math.exp(-((frame % BEAT) / 5));
}

/** Particules lumineuses qui montent (positions déterministes). */
function Particles({ count = 46 }: { count?: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const x = random(`x${i}`) * width;
        const speed = 0.6 + random(`s${i}`) * 1.8;
        const y = (random(`y${i}`) * height - frame * speed * 2 + height * 4) % height;
        const size = 3 + random(`z${i}`) * 7;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame / (12 + random(`t${i}`) * 20) + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: i % 3 === 0 ? C.cyan : "#93c5fd",
              opacity: 0.55 * tw,
              boxShadow: `0 0 ${size * 3}px ${C.cyan}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** Éclair plein écran (transition / impact). */
function Flash({ at, color = "#ffffff", strength = 0.85 }: { at: number; color?: string; strength?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 2, at + 10], [0, strength, 0], clamp);
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: "none", mixBlendMode: "screen" }} />;
}

/** Traînée lumineuse diagonale. */
function Streak({ at, duration = 18 }: { at: number; duration?: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + duration], [-0.4, 1.4], clamp);
  if (frame < at || frame > at + duration) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "-20%",
          bottom: "-20%",
          left: `${p * 100}%`,
          width: 220,
          transform: "rotate(18deg)",
          background: `linear-gradient(90deg, transparent, ${C.cyan}55, #ffffffcc, ${C.cyan}55, transparent)`,
          filter: "blur(6px)",
        }}
      />
    </AbsoluteFill>
  );
}

/** Secousse de caméra après un impact. */
function useShake(hits: number[], amp = 22) {
  const frame = useCurrentFrame();
  let x = 0;
  let y = 0;
  for (const h of hits) {
    const t = frame - h;
    if (t >= 0 && t < 14) {
      const k = amp * Math.exp(-t / 4);
      x += (random(`sx${h}-${t}`) - 0.5) * k;
      y += (random(`sy${h}-${t}`) - 0.5) * k;
    }
  }
  return `translate(${x}px, ${y}px)`;
}

/** Texte révélé lettre par lettre (ressort, rotation 3D, flou). */
function Kinetic({
  children,
  at,
  size,
  gradient = false,
  stagger = 1.4,
  weight = 800,
  color,
}: {
  children: string;
  at: number;
  size: number;
  gradient?: boolean;
  stagger?: number;
  weight?: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  return (
    <span style={{ display: "inline-block", perspective: 900, whiteSpace: "pre" }}>
      {[...children].map((ch, i) => {
        const f = frame - at - i * stagger;
        const p = f <= 0 ? 0 : Math.min(1, 1 - Math.exp(-f / 4.5) * Math.cos(f / 3.2));
        const op = interpolate(f, [0, 6], [0, 1], clamp);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              ...T(size, weight, color),
              transform: `translateY(${(1 - p) * 0.6 * size}px) rotateX(${(1 - p) * -70}deg) scale(${0.7 + p * 0.3})`,
              opacity: op,
              filter: `blur(${(1 - Math.min(1, p)) * 8}px)`,
              ...(gradient ? gradientText : {}),
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}

// ------------------------------------------------------------------ sous-titres karaoké
/** Associe chaque mot affiché à l'horodatage du mot prononcé correspondant (« 200 » ↔ « deux cents »). */
function captionTokens(l: Line) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9']/g, "");
  // Ponctuation haute (« ? », « ! », « : ») collée au mot précédent par une espace insécable.
  const shown = l.show.replace(/ ([?!:;])/g, " $1").split(/ +/);
  let cursor = 0;
  return shown.map((w) => {
    let idx = l.words.findIndex((s, i) => i >= cursor && i < cursor + 3 && norm(s.text) === norm(w));
    if (idx < 0) idx = Math.min(cursor, l.words.length - 1);
    cursor = idx + 1;
    return { text: w, ms: l.words[idx]?.ms ?? 0 };
  });
}

function Captions() {
  const frame = useCurrentFrame();
  const current = LINES.find((l) => frame >= START[l.id]! - 2 && frame <= endOf(l.id) + 8);
  if (!current) return null;
  const start = START[current.id]!;
  const tokens = captionTokens(current);
  const appear = interpolate(frame, [start - 2, start + 6], [0, 1], clamp);
  const leave = interpolate(frame, [endOf(current.id), endOf(current.id) + 8], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 300,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "10px 14px",
        padding: "22px 26px",
        borderRadius: 34,
        background: "rgba(4, 10, 30, 0.62)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.08)",
        opacity: appear * (1 - leave),
        transform: `translateY(${(1 - appear) * 30}px)`,
      }}
    >
      {tokens.map((t, i) => {
        const at = start + Math.round((Math.min(t.ms, current.durationMs - 150) / 1000) * FPS);
        const next = tokens[i + 1];
        const until = next ? start + Math.round((next.ms / 1000) * FPS) : endOf(current.id);
        const active = frame >= at && frame < until;
        const said = frame >= at;
        const pop = interpolate(frame, [at, at + 4, at + 9], [1, 1.12, 1], clamp);
        return (
          <span
            key={i}
            style={{
              ...T(52, 800, said ? C.white : "rgba(255,255,255,0.35)"),
              letterSpacing: "-0.02em",
              padding: "6px 16px",
              borderRadius: 16,
              background: active ? `linear-gradient(100deg, ${C.brand}, ${C.cyan})` : "transparent",
              boxShadow: active ? `0 10px 30px ${C.brand}88` : "none",
              transform: `scale(${active ? pop : 1})`,
              textShadow: "0 4px 18px rgba(0,0,0,0.6)",
            }}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ 1. accroche + 0 FC
function Hook() {
  const frame = useCurrentFrame();
  const drop = endOf("l1") - 4;
  const count = Math.round(interpolate(frame, [drop - 22, drop + 2], [25000, 0], { ...clamp, easing: Easing.in(Easing.cubic) }));
  const landed = frame >= drop + 2;
  const zoom = interpolate(frame, [0, 150], [1.08, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${zoom})` }}>
      <div style={{ textAlign: "center", marginTop: -260 }}>
        <div>
          <Kinetic at={wordAt("l1", 0)} size={92}>
            Trouver une adresse
          </Kinetic>
        </div>
        <div>
          <Kinetic at={wordAt("l1", 3)} size={92}>
            {"à "}
          </Kinetic>
          <Kinetic at={wordAt("l1", 4)} size={92} gradient>
            Kisangani,
          </Kinetic>
        </div>
        <div>
          <Kinetic at={wordAt("l1", 5)} size={92}>
            ça coûte combien ?
          </Kinetic>
        </div>
        <div
          style={{
            ...T(landed ? 330 : 190),
            marginTop: 40,
            fontVariantNumeric: "tabular-nums",
            opacity: interpolate(frame, [drop - 24, drop - 18], [0, 1], clamp),
            transform: `scale(${landed ? interpolate(frame, [drop + 2, drop + 10], [1.35, 1], clamp) : 1})`,
            textShadow: landed ? `-6px 0 0 ${C.cyan}aa, 6px 0 0 #ff2d75aa` : "none",
            ...(landed ? gradientText : {}),
          }}
        >
          {count.toLocaleString("fr-FR")} FC
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 2. « Rien. » + GRATUIT + logo
function Reveal() {
  const frame = useCurrentFrame();
  const stampAt = START.l2! + 15;
  const stamp = useSpring(stampAt, { damping: 9, stiffness: 220, mass: 0.6 });
  const logoAt = wordAt("l3", 1) - 4;
  const logo = useSpring(logoAt, { damping: 12, stiffness: 120 });
  const ring = interpolate(frame, [logoAt, logoAt + 40], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 330, textAlign: "center" }}>
        <Kinetic at={START.l2!} size={150}>
          Rien.
        </Kinetic>
      </div>
      <div
        style={{
          position: "absolute",
          top: 560,
          padding: "18px 60px",
          border: `12px solid ${C.whatsapp}`,
          borderRadius: 36,
          ...T(150, 800, C.whatsapp),
          letterSpacing: "0.06em",
          transform: `rotate(-9deg) scale(${frame < stampAt ? 0 : 2.6 - stamp * 1.6})`,
          opacity: frame < stampAt ? 0 : Math.min(1, stamp * 1.5),
          boxShadow: `0 0 80px ${C.whatsapp}66, inset 0 0 40px ${C.whatsapp}33`,
          textShadow: `0 0 40px ${C.whatsapp}aa`,
        }}
      >
        GRATUIT
      </div>
      <div style={{ position: "absolute", top: 930, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 300, height: 300 }}>
          <div
            style={{
              position: "absolute",
              left: 150 - 300 * ring,
              top: 150 - 300 * ring,
              width: 600 * ring,
              height: 600 * ring,
              borderRadius: "50%",
              border: `4px solid ${C.cyan}`,
              opacity: (1 - ring) * 0.8,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -70,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${C.cyan}77, transparent 65%)`,
              opacity: logo * (0.5 + beat * 0.35),
              filter: "blur(24px)",
            }}
          />
          <Img
            src={staticFile("brand/emblem-720.png")}
            style={{
              position: "relative",
              width: 300,
              height: 300,
              borderRadius: 66,
              transform: `scale(${0.3 + logo * 0.7}) rotate(${(1 - logo) * -25}deg)`,
              opacity: logo,
              boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
            }}
          />
        </div>
        <div style={{ marginTop: 40 }}>
          <Kinetic at={wordAt("l3", 1)} size={100}>
            {"Boyoma "}
          </Kinetic>
          <Kinetic at={wordAt("l3", 2)} size={100} gradient>
            Connect
          </Kinetic>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 3. catégories, une par mot
const CATS = [
  { word: "Pharmacies", emoji: "💊", color: "#22c55e" },
  { word: "Hôtels", emoji: "🏨", color: "#8b5cf6" },
  { word: "Restaurants", emoji: "🍽️", color: "#f97316" },
  { word: "Garages", emoji: "🔧", color: "#06b6d4" },
];
function Categories() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {CATS.map((c, i) => {
        const at = wordAt("l4", i) - 3;
        const next = i < CATS.length - 1 ? wordAt("l4", i + 1) - 3 : endOf("l4") + 30;
        const inP = interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const outP = interpolate(frame, [next - 2, next + 6], [0, 1], clamp);
        const dir = i % 2 === 0 ? 1 : -1;
        if (frame < at - 1 || frame > next + 8) return null;
        return (
          <div
            key={c.word}
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 30,
              transform: `translateX(${(1 - inP) * 900 * dir - outP * 900 * dir}px) skewX(${(1 - inP + outP) * -18 * dir}deg)`,
              filter: `blur(${(1 - inP + outP) * 14}px)`,
              opacity: inP * (1 - outP),
            }}
          >
            <div
              style={{
                width: 260,
                height: 260,
                borderRadius: 70,
                display: "grid",
                placeItems: "center",
                fontSize: 150,
                background: `linear-gradient(145deg, ${c.color}55, ${c.color}11)`,
                border: `3px solid ${c.color}99`,
                boxShadow: `0 0 120px ${c.color}66`,
              }}
            >
              {c.emoji}
            </div>
            <div style={{ ...T(150), textShadow: `0 0 60px ${c.color}88` }}>{c.word}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 4. cherchez, trouvez, appelez (caméra dans le téléphone)
function Journey() {
  const frame = useCurrentFrame();
  const a = wordAt("l5", 0);
  const b = wordAt("l5", 1);
  const c = wordAt("l5", 2);
  const enter = useSpring(a - 10, { damping: 18, stiffness: 90 });
  const showPlace = frame >= b - 2;
  const flip = interpolate(frame, [b - 6, b + 4], [0, 1], clamp);
  const zoomCall = interpolate(frame, [c - 4, c + 14], [1, 1.3], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  // Bouton « Appeler » mesuré sur la capture : 14,4 % de la largeur, 61,9 % de la hauteur de l'écran.
  const W = 400;
  const H = (W * 844) / 390;
  const bx = 0.144 * W;
  const by = 0.619 * H;
  const ringP = interpolate(frame, [c + 8, c + 40], [0, 1], clamp);
  const label = (text: string, at: number, color: string) => {
    const p = interpolate(frame, [at - 2, at + 6], [0, 1], clamp);
    return (
      <span style={{ ...T(68), color, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, display: "inline-block", margin: "0 10px" }}>
        {text}
      </span>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 210, textAlign: "center" }}>
        {label("Cherchez.", a, C.white)}
        {label("Trouvez.", b, C.cyan)}
        {label("Appelez.", c, C.whatsapp)}
      </div>
      <div
        style={{
          position: "absolute",
          top: 560,
          transformOrigin: `${22 + bx}px ${22 + by}px`,
          transform: `translateY(${(1 - enter) * 900}px) rotateY(${(1 - enter) * 25 + Math.sin(flip * Math.PI) * 50}deg) scale(${zoomCall})`,
        }}
      >
        <Phone src={showPlace ? "place.png" : "search.png"} width={W}>
          {showPlace && (
            <div
              style={{
                position: "absolute",
                left: bx,
                top: by,
                width: 64,
                height: 64,
                marginLeft: -32,
                marginTop: -32,
                borderRadius: "50%",
                border: `5px solid ${C.whatsapp}`,
                transform: `scale(${1 + ringP * 2.4})`,
                opacity: frame >= c + 8 ? 1 - ringP : 0,
              }}
            />
          )}
        </Phone>
      </div>
    </AbsoluteFill>
  );
}
const pill = (bg: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 14,
  padding: "20px 36px",
  borderRadius: 999,
  background: bg,
  boxShadow: `0 20px 60px ${bg}88`,
  ...T(44, 800),
});

// ------------------------------------------------------------------ 5. 200+ lieux, toute la Tshopo
function Coverage() {
  const frame = useCurrentFrame();
  const s = START.l6!;
  const n = Math.round(interpolate(frame, [s, wordAt("l6", 4)], [0, 200], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const phone = useSpring(wordAt("l6", 5) - 6, { damping: 18, stiffness: 100 });
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 220, textAlign: "center" }}>
        <div style={{ ...T(250), ...gradientText, fontVariantNumeric: "tabular-nums", transform: `scale(${1 + beat * 0.03})` }}>{n}+</div>
        <div style={T(64, 700, C.ink)}>lieux référencés</div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 610,
          transform: `translateY(${(1 - phone) * 700}px) rotateX(${(1 - phone) * 40}deg)`,
          opacity: phone,
        }}
      >
        <Phone src="zone.png" width={360} />
      </div>
      {["Kisangani", "Banalia", "Bafwasende", "Basoko", "Isangi", "Opala", "Ubundu", "Yahuma"].map((name, i) => {
        const at = wordAt("l6", 6) + i * 3;
        const p = interpolate(frame, [at, at + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
        const left = i % 2 === 0;
        const row = Math.floor(i / 2);
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: left ? 40 - (1 - p) * 200 : 800 + (1 - p) * 200,
              top: 680 + row * 130,
              width: 240,
              textAlign: "center",
              padding: "10px 0",
              borderRadius: 999,
              background: i === 0 ? `linear-gradient(100deg, ${C.brand}, ${C.cyan})` : "rgba(18,34,74,0.75)",
              border: "2px solid rgba(255,255,255,0.15)",
              ...T(34, 700),
              opacity: p,
              transform: `scale(${0.6 + p * 0.4})`,
            }}
          >
            {name}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 6. établissements
const FEATURES = [
  { icon: <IconImage size={50} />, text: "Photos et logo" },
  { icon: <IconChat size={50} />, text: "Téléphone et WhatsApp" },
  { icon: <IconPin size={50} />, text: "Catalogue produits et services" },
  { icon: <IconCheck size={50} />, text: "Horaires et itinéraire" },
];
function Business() {
  const frame = useCurrentFrame();
  const q = START.l7!;
  const second = wordAt("l7", 4);
  const gratuite = wordAt("l7", 8);
  const stamp = useSpring(gratuite, { damping: 9, stiffness: 220, mass: 0.6 });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 200, textAlign: "center", padding: "0 60px" }}>
        <div style={{ ...T(40, 700, C.cyan), letterSpacing: "0.12em", textTransform: "uppercase", opacity: interpolate(frame, [q, q + 8], [0, 1], clamp) }}>
          Vous avez un établissement ?
        </div>
        <div style={{ marginTop: 30 }}>
          <Kinetic at={second} size={96}>
            Votre fiche aussi
          </Kinetic>
        </div>
        <div style={{ marginTop: 10, display: "inline-block", transform: `rotate(-4deg) scale(${frame < gratuite ? 0 : 2 - stamp})`, opacity: frame < gratuite ? 0 : 1 }}>
          <span style={{ ...T(120), ...gradientText }}>est gratuite.</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 680, left: 90, right: 90, display: "flex", flexDirection: "column", gap: 18, perspective: 1400 }}>
        {FEATURES.map((f, i) => {
          const at = q + 14 + i * 16;
          const p = interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          return (
            <div
              key={f.text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "20px 30px",
                borderRadius: 32,
                background: "linear-gradient(120deg, rgba(37,99,235,0.28), rgba(6,182,212,0.12))",
                border: "2px solid rgba(255,255,255,0.14)",
                boxShadow: "0 30px 70px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                backdropFilter: "blur(20px)",
                transform: `rotateY(${(1 - p) * -75}deg) translateX(${(1 - p) * -200}px)`,
                transformOrigin: "0% 50%",
                opacity: p,
              }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 92,
                  height: 92,
                  borderRadius: 28,
                  background: `linear-gradient(135deg, ${C.brand}, ${C.cyan})`,
                  flexShrink: 0,
                }}
              >
                {f.icon}
              </span>
              <span style={T(46, 700)}>{f.text}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 7. final
function Outro() {
  const frame = useCurrentFrame();
  const s = START.l8!;
  const logo = useSpring(s - 6, { damping: 12, stiffness: 110 });
  const url = useSpring(wordAt("l8", 2) + 4);
  const beat = useBeat();
  const sweep = interpolate(frame, [wordAt("l8", 5), wordAt("l8", 5) + 30], [-30, 130], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 46, paddingBottom: 260 }}>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: -90,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${C.cyan}77, transparent 65%)`,
            opacity: logo * (0.45 + beat * 0.4),
            filter: "blur(30px)",
          }}
        />
        <Img
          src={staticFile("brand/emblem-720.png")}
          style={{ position: "relative", width: 330, height: 330, borderRadius: 74, transform: `scale(${0.4 + logo * 0.6}) rotateY(${(1 - logo) * 180}deg)`, opacity: logo }}
        />
      </div>
      <div>
        <Kinetic at={s} size={110}>
          {"Boyoma "}
        </Kinetic>
        <Kinetic at={wordAt("l8", 1)} size={110} gradient>
          Connect
        </Kinetic>
      </div>
      <div style={{ ...T(50, 600, C.ink), opacity: url, transform: `translateY(${(1 - url) * 20}px)` }}>Toute la Tshopo, à portée de main.</div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "28px 54px",
          borderRadius: 999,
          background: `linear-gradient(100deg, ${C.brand}, ${C.cyan})`,
          boxShadow: `0 30px 90px ${C.brand}88`,
          ...T(50, 800),
          letterSpacing: "-0.01em",
          opacity: url,
          transform: `scale(${0.85 + url * 0.15 + beat * 0.015})`,
        }}
      >
        boyoma-connect.vercel.app
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep}%`,
            width: "16%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            transform: "skewX(-20deg)",
          }}
        />
      </div>
      <div style={{ ...T(40, 800, C.whatsapp), letterSpacing: "0.1em", opacity: url }}>100 % GRATUIT</div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ montage
/**
 * Fenêtre d'affichage en temps ABSOLU (pas de <Sequence>, qui remettrait le compteur à zéro) :
 * les scènes sont calées sur l'horodatage de la voix off.
 */
function Part({ from, to, children, fade = 8 }: { from: number; to: number; children: ReactNode; fade?: number }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const local = frame - from;
  const duration = to - from;
  const o = interpolate(local, [0, fade, duration - fade, duration], [0, 1, 1, 0], clamp);
  const sc = interpolate(local, [duration - fade, duration], [1, 1.08], clamp);
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${sc})`, filter: `blur(${(1 - o) * 12}px)` }}>{children}</AbsoluteFill>;
}

export function Voix33() {
  const impacts = [endOf("l1") - 2, START.l2! + 15, wordAt("l3", 1) - 4, wordAt("l7", 8)];
  const shake = useShake(impacts);
  const beat = useBeat();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {/* Son : nappe, voix, effets. */}
      <Audio src={staticFile("sfx/music.wav")} volume={(f) => interpolate(f, [0, 20, 950, 990], [0, 0.32, 0.32, 0], clamp)} />
      {LINES.map((l) => (
        <Sequence key={l.id} from={START[l.id]!}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      {impacts.map((f) => (
        <Sequence key={`i${f}`} from={f}>
          <Audio src={staticFile("sfx/impact.wav")} volume={0.75} />
        </Sequence>
      ))}
      <Sequence from={START.l3! - 40}>
        <Audio src={staticFile("sfx/riser.wav")} volume={0.45} />
      </Sequence>
      {[START.l4! - 8, START.l5! - 10, START.l6! - 8, START.l7! - 8, START.l8! - 10].map((f) => (
        <Sequence key={`w${f}`} from={f}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.55} />
        </Sequence>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Sequence key={`p${i}`} from={wordAt("l4", i) - 3}>
          <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
        </Sequence>
      ))}

      {/* Image. */}
      <div style={{ position: "absolute", inset: 0, filter: `brightness(${1 + beat * 0.06})` }}>
        <Background intensity={1.1} />
      </div>
      <Particles />
      <AbsoluteFill style={{ transform: shake }}>
        <Part from={0} to={150}>
          <Hook />
        </Part>
        <Part from={146} to={292}>
          <Reveal />
        </Part>
        <Part from={290} to={414}>
          <Categories />
        </Part>
        <Part from={410} to={524}>
          <Journey />
        </Part>
        <Part from={520} to={632}>
          <Coverage />
        </Part>
        <Part from={628} to={794}>
          <Business />
        </Part>
        <Part from={790} to={VOIX_FRAMES + 1} fade={8}>
          <Outro />
        </Part>
      </AbsoluteFill>
      {impacts.map((f) => (
        <Flash key={`f${f}`} at={f} strength={0.55} />
      ))}
      {[START.l4! - 6, START.l6! - 6, START.l8! - 8].map((f) => (
        <Streak key={`s${f}`} at={f} />
      ))}
      <Captions />
      {/* Vignette */}
      <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
}
