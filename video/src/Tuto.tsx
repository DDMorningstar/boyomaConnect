import React from "react";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, fontFamily, gradientText } from "./theme";
import { Background, clamp, useSpring } from "./ui/kit";
import voice from "./voice-tuto.json";

void React;

/**
 * Tutoriel « Inscrire son établissement de A à Z » — vertical 1080 × 1920, voix off (Hortense).
 * Écrans publics : vraies captures (connexion, création de compte, ajouter un lieu, recherche, accueil).
 * Écrans réservés aux comptes connectés : reconstitués fidèlement d'après le code de l'application
 * (mêmes titres, champs, boutons). Données d'exemple génériques (« Mon établissement », numéro masqué).
 */
const FPS = 30;
const GAP = 12;
type Line = { id: string; show: string; file: string; durationMs: number; words: { text: string; ms: number }[] };
const LINES = voice as Line[];
const STEP_LINES = new Set(["t2", "t4", "t7", "t11", "t12", "t13"]);

/** Calendrier : chaque phrase suit la précédente (pause plus longue avant une nouvelle étape). */
const START: Record<string, number> = {};
{
  let t = 15;
  for (const l of LINES) {
    if (STEP_LINES.has(l.id)) t += 14;
    START[l.id] = t;
    t += Math.ceil((l.durationMs / 1000) * FPS) + GAP;
  }
}
const line = (id: string) => LINES.find((l) => l.id === id)!;
const endOf = (id: string) => START[id]! + Math.ceil((line(id).durationMs / 1000) * FPS);
/** Image où commence le n-ième mot prononcé d'une phrase. */
const wordAt = (id: string, n: number) =>
  START[id]! + Math.round(((line(id).words[Math.min(n, line(id).words.length - 1)]?.ms ?? 0) / 1000) * FPS);
export const TUTO_FRAMES = endOf("t16") + 80;

const STEPS = [
  { n: 1, label: "Vérifier", from: "t2" },
  { n: 2, label: "Compte", from: "t4" },
  { n: 3, label: "Fiche", from: "t7" },
  { n: 4, label: "Contacts", from: "t11" },
  { n: 5, label: "Photos", from: "t12" },
  { n: 6, label: "Validation", from: "t13" },
];

const T = (size: number, weight = 800, color: string = C.white): CSSProperties => ({
  fontFamily,
  fontWeight: weight,
  fontSize: size,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color,
  margin: 0,
});

// ------------------------------------------------------------------ appareil (écran 390 × 844 px logiques)
const DW = 480; // largeur de l'écran dans la vidéo
const K = DW / 390;
const DH = 844 * K;
const BEZEL = 20;

/**
 * Téléphone dont l'écran utilise les coordonnées de l'application (390 × 844). `zoom` agrandit autour
 * d'un point de l'écran (caméra qui s'approche du champ en cours).
 */
function Device({ children, zoom }: { children: ReactNode; zoom?: { x: number; y: number; s: number } }) {
  const z = zoom ?? { x: 195, y: 422, s: 1 };
  return (
    <div
      style={{
        position: "absolute",
        left: 540 - DW / 2 - BEZEL,
        top: 300,
        transformOrigin: `${BEZEL + z.x * K}px ${BEZEL + z.y * K}px`,
        transform: `scale(${z.s})`,
      }}
    >
      <div
        style={{
          width: DW + BEZEL * 2,
          height: DH + BEZEL * 2,
          padding: BEZEL,
          borderRadius: 90,
          background: "linear-gradient(145deg, #1f2a44, #05070d 60%)",
          boxShadow: "0 80px 160px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.06), 0 0 120px rgba(37,99,235,0.22)",
        }}
      >
        <div style={{ position: "relative", width: DW, height: DH, borderRadius: 70, overflow: "hidden", background: "#060c1f" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: 844, transform: `scale(${K})`, transformOrigin: "0 0" }}>
            {children}
          </div>
          <div style={{ position: "absolute", top: 16, left: "50%", width: 150, height: 40, marginLeft: -75, borderRadius: 26, background: "#000" }} />
        </div>
      </div>
    </div>
  );
}

/** Capture réelle plein écran (390 × 844). */
const Shot = ({ src, opacity = 1 }: { src: string; opacity?: number }) => (
  <Img src={staticFile(`screens/${src}`)} style={{ position: "absolute", inset: 0, width: 390, height: 844, opacity }} />
);

/** Toucher : point + onde, à l'image `at`, position en coordonnées de l'écran. */
function Tap({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const f = frame - at;
  if (f < -10 || f > 26) return null;
  const appear = interpolate(f, [-10, -2], [0, 1], clamp);
  const press = interpolate(f, [-2, 2, 8], [1, 0.75, 1], clamp);
  const ring = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 30,
          top: y - 30,
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: `3px solid ${C.white}`,
          transform: `scale(${1 + ring * 1.8})`,
          opacity: (1 - ring) * (f >= 0 ? 0.9 : 0),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - 18,
          top: y - 18,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.85)",
          boxShadow: "0 0 0 6px rgba(255,255,255,0.25), 0 6px 20px rgba(0,0,0,0.4)",
          transform: `scale(${press})`,
          opacity: appear * interpolate(f, [16, 26], [1, 0], clamp),
        }}
      />
    </>
  );
}

/** Texte tapé au clavier entre `from` et `to`. */
function Typed({ text, from, to }: { text: string; from: number; to: number }) {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [from, to], [0, text.length], clamp));
  const caret = frame >= from && frame < to + 20 && Math.floor(frame / 8) % 2 === 0;
  return (
    <>
      {text.slice(0, n)}
      <span style={{ opacity: caret ? 1 : 0, color: C.brand }}>|</span>
    </>
  );
}

// ------------------------------------------------------------------ éléments d'interface reconstitués (style de l'app)
const UI = {
  bg: "#060c1f",
  surface: "#0b1530",
  surface2: "#111d3d",
  line: "#22325c",
  muted: "#8b9bbd",
  font: (size: number, weight = 600, color = "#e8eefc"): CSSProperties => ({ fontFamily, fontWeight: weight, fontSize: size, color, letterSpacing: "-0.01em", lineHeight: 1.3 }),
};

function AppHeader() {
  return (
    <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: `1px solid ${UI.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Img src={staticFile("brand/emblem-192.webp")} style={{ width: 36, height: 36, borderRadius: 10 }} />
        <span style={UI.font(15, 800)}>
          Boyoma <span style={{ color: C.brand }}>Connect</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${UI.line}` }} />
        <div style={{ width: 40, height: 40, borderRadius: 20, background: C.brand, display: "grid", placeItems: "center", ...UI.font(22, 500) }}>+</div>
      </div>
    </div>
  );
}

function Field({ label, value, height = 46, placeholder, active }: { label: string; value?: ReactNode; height?: number; placeholder?: string; active?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...UI.font(13, 700), marginBottom: 6 }}>{label}</div>
      <div
        style={{
          minHeight: height,
          borderRadius: 16,
          border: `1.5px solid ${active ? C.brand : UI.line}`,
          boxShadow: active ? `0 0 0 4px ${C.brand}33` : "none",
          background: UI.surface,
          padding: "12px 14px",
          ...UI.font(14, 500, value ? "#e8eefc" : UI.muted),
        }}
      >
        {value ?? placeholder ?? ""}
      </div>
    </div>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <div style={{ ...UI.font(17, 800), margin: "8px 0 10px" }}>{children}</div>;
}

function PrimaryButton({ children, pressed = false }: { children: ReactNode; pressed?: boolean }) {
  return (
    <div
      style={{
        height: 46,
        borderRadius: 23,
        background: C.brand,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...UI.font(14, 700, "#fff"),
        transform: `scale(${pressed ? 0.97 : 1})`,
        boxShadow: "0 10px 30px rgba(37,99,235,0.45)",
      }}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ scènes
/** Fenêtre d'affichage en temps absolu (calée sur la voix). */
function Part({ from, to, children, fade = 8 }: { from: number; to: number; children: ReactNode; fade?: number }) {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const local = frame - from;
  const o = interpolate(local, [0, fade, to - from - fade, to - from], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

/** Arrivée du téléphone (glisse depuis le bas) au début d'une partie. */
function useDeviceIn(at: number) {
  return useSpring(at, { damping: 18, stiffness: 90 });
}

function Intro() {
  const frame = useCurrentFrame();
  const logo = useSpring(START.t1! - 10, { damping: 12, stiffness: 110 });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34, paddingBottom: 300 }}>
      <Img
        src={staticFile("brand/emblem-720.png")}
        style={{ width: 240, height: 240, borderRadius: 56, transform: `scale(${0.4 + logo * 0.6})`, opacity: logo, boxShadow: `0 0 120px ${C.cyan}55` }}
      />
      <div style={{ textAlign: "center", opacity: logo }}>
        <div style={T(52, 700, C.cyan)}>TUTORIEL</div>
        <div style={{ ...T(92), marginTop: 10 }}>Inscrire votre</div>
        <div style={{ ...T(92), ...gradientText }}>établissement</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: 900 }}>
        {STEPS.map((s, i) => {
          const p = interpolate(frame, [wordAt("t1", 9) + i * 4, wordAt("t1", 9) + i * 4 + 10], [0, 1], clamp);
          return (
            <div key={s.n} style={{ padding: "12px 24px", borderRadius: 999, background: "rgba(18,34,74,0.7)", border: "2px solid rgba(255,255,255,0.12)", ...T(34, 700), opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
              <span style={{ color: C.cyan }}>{s.n}.</span> {s.label}
            </div>
          );
        })}
      </div>
      <div style={{ ...T(40, 800, C.whatsapp), letterSpacing: "0.08em", opacity: interpolate(frame, [wordAt("t1", 5), wordAt("t1", 5) + 8], [0, 1], clamp) }}>100 % GRATUIT</div>
    </AbsoluteFill>
  );
}

/** Étape 1 : chercher, puis réclamer une fiche existante. */
function StepCheck() {
  const frame = useCurrentFrame();
  const inP = useDeviceIn(START.t2! - 6);
  const showClaim = frame >= START.t3! - 4;
  const claimAt = wordAt("t3", 7);
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - inP) * 1200}px)` }}>
      <Device zoom={showClaim ? { x: 195, y: 520, s: interpolate(frame, [claimAt - 20, claimAt - 4], [1, 1.25], clamp) } : undefined}>
        {!showClaim ? (
          <>
            <Shot src="search.png" />
            <Tap x={180} y={135} at={wordAt("t2", 8)} />
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, background: UI.bg }}>
            <AppHeader />
            <div style={{ height: 200, background: "linear-gradient(135deg, #1d3a7a, #0e7490)", display: "grid", placeItems: "center" }}>
              <div style={{ width: 84, height: 84, borderRadius: 22, background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)" }} />
            </div>
            <div style={{ padding: 16 }}>
              <div style={UI.font(12, 700, "#a78bfa")}>Restaurants</div>
              <div style={UI.font(22, 800)}>Votre établissement</div>
              <div style={{ ...UI.font(13, 500, UI.muted), marginTop: 4 }}>Commune de Makiso, Kisangani</div>
              <div style={{ marginTop: 18, padding: 14, borderRadius: 18, border: `1px solid ${UI.line}`, background: UI.surface }}>
                <div style={UI.font(14, 700)}>Vous gérez cet établissement ?</div>
                <div style={{ ...UI.font(12, 500, UI.muted), margin: "4px 0 12px" }}>Prenez la main sur la fiche : photos, horaires, catalogue.</div>
                <PrimaryButton pressed={frame >= claimAt && frame < claimAt + 6}>Réclamez cette fiche</PrimaryButton>
              </div>
            </div>
            <Tap x={195} y={524} at={claimAt} />
          </div>
        )}
      </Device>
    </AbsoluteFill>
  );
}

/** Étape 2 : compte (captures réelles de la page de connexion). */
function StepAccount() {
  const frame = useCurrentFrame();
  const inP = useDeviceIn(START.t4! - 6);
  const tabAt = wordAt("t4", 9);
  const typing = frame >= START.t5! - 4;
  const n0 = wordAt("t5", 2);
  const e0 = wordAt("t5", 4);
  const p0 = wordAt("t5", 8);
  const accept = wordAt("t5", 15);
  const sheet = interpolate(frame, [accept - 10, accept], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const zoomY = frame < n0 ? 470 : frame < e0 + 10 ? 600 : frame < accept - 10 ? 735 : 760;
  const z = typing ? interpolate(frame, [START.t5! - 4, START.t5! + 10], [1, 1.35], clamp) : 1;
  const typeStyle: CSSProperties = { position: "absolute", left: 48, ...UI.font(15, 600) };
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - inP) * 1200}px)` }}>
      <Device zoom={{ x: 195, y: zoomY, s: z }}>
        <Shot src="tuto-connexion.png" />
        <Shot src="tuto-inscription.png" opacity={interpolate(frame, [tabAt + 2, tabAt + 8], [0, 1], clamp)} />
        <Tap x={351} y={808} at={wordAt("t4", 7)} />
        <Tap x={270} y={474} at={tabAt} />
        {typing && (
          <>
            <div style={{ ...typeStyle, top: 550 }}>
              <Typed text="Votre nom" from={n0} to={n0 + 14} />
            </div>
            <div style={{ ...typeStyle, top: 636 }}>
              <Typed text="vous@exemple.com" from={e0} to={e0 + 18} />
            </div>
            <div style={{ ...typeStyle, top: 724, letterSpacing: "0.2em" }}>
              <Typed text="••••••••" from={p0} to={p0 + 14} />
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "16px 16px 28px",
                background: UI.bg,
                borderTop: `1px solid ${UI.line}`,
                transform: `translateY(${(1 - sheet) * 120}%)`,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 2, background: frame >= accept + 4 ? C.brand : "transparent", border: `2px solid ${frame >= accept + 4 ? C.brand : UI.muted}`, color: "#fff", fontSize: 14, display: "grid", placeItems: "center" }}>
                  {frame >= accept + 4 ? "✓" : ""}
                </div>
                <div style={UI.font(13, 500)}>J&apos;accepte les conditions d&apos;utilisation et la politique de confidentialité.</div>
              </div>
              <PrimaryButton pressed={frame >= endOf("t5") - 6 && frame < endOf("t5")}>Créer mon compte</PrimaryButton>
            </div>
            <Tap x={26} y={735} at={accept + 2} />
            <Tap x={195} y={800} at={endOf("t5") - 6} />
          </>
        )}
      </Device>
    </AbsoluteFill>
  );
}

/** Confirmation par e-mail (ou Google). */
function Confirm() {
  const frame = useCurrentFrame();
  const card = useSpring(START.t6! - 4);
  const click = wordAt("t6", 7);
  const google = wordAt("t6", 14);
  const g = interpolate(frame, [google - 6, google + 4], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 380,
          width: 820,
          padding: "50px 56px",
          borderRadius: 48,
          background: "linear-gradient(160deg, rgba(18,34,74,0.95), rgba(8,16,40,0.95))",
          border: "2px solid rgba(255,255,255,0.12)",
          boxShadow: "0 60px 120px rgba(0,0,0,0.5)",
          transform: `translateY(${(1 - card) * 300}px) scale(${0.9 + card * 0.1})`,
          opacity: card * (1 - g * 0.85),
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 120 }}>✉️</div>
        <div style={{ ...T(52), marginTop: 10 }}>Confirmez votre adresse</div>
        <div style={{ ...T(34, 500, C.muted), margin: "16px 0 34px" }}>Un e-mail vient d&apos;arriver : ouvrez-le et cliquez sur le lien de confirmation.</div>
        <div style={{ display: "inline-block", padding: "24px 60px", borderRadius: 999, background: C.brand, ...T(38, 800), transform: `scale(${frame >= click && frame < click + 6 ? 0.95 : 1})` }}>
          Confirmer mon adresse
        </div>
        <div style={{ ...T(30, 600, C.whatsapp), marginTop: 26, opacity: interpolate(frame, [click + 6, click + 14], [0, 1], clamp) }}>✓ Compte activé</div>
      </div>
      <div style={{ position: "absolute", top: 1010, ...T(40, 700, C.muted), opacity: g }}>ou, en un geste :</div>
      <div
        style={{
          position: "absolute",
          top: 1090,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "26px 56px",
          borderRadius: 999,
          background: "#0b1020",
          border: "2px solid rgba(255,255,255,0.35)",
          ...T(42, 700),
          opacity: g,
          transform: `scale(${0.8 + g * 0.2})`,
        }}
      >
        <span style={{ ...T(50, 800), color: "#4285F4" }}>G</span> Continuer avec Google
      </div>
    </AbsoluteFill>
  );
}

/** Étape 3 : « + » puis « Créer ma fiche » (captures réelles). */
function StepOpenForm() {
  const frame = useCurrentFrame();
  const inP = useDeviceIn(START.t7! - 6);
  const plusAt = wordAt("t7", 5);
  const createAt = wordAt("t7", 8);
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - inP) * 1200}px)` }}>
      <Device>
        <Shot src="home.png" />
        <Shot src="tuto-ajouter.png" opacity={interpolate(frame, [plusAt + 6, plusAt + 12], [0, 1], clamp)} />
        <Tap x={351} y={32} at={plusAt} />
        <Tap x={96} y={469} at={createAt} />
      </Device>
    </AbsoluteFill>
  );
}

/** Étapes 3 à 6 : formulaire « Créer la fiche de mon établissement » (reconstitué), défilement + zooms. */
function StepForm() {
  const frame = useCurrentFrame();
  // Repères temporels (mots prononcés)
  const nameAt = wordAt("t8", 2);
  const catAt = wordAt("t8", 8);
  const comAt = wordAt("t8", 11);
  const presAt = wordAt("t9", 3);
  const addrAt = wordAt("t9", 5);
  const repAt = wordAt("t9", 10);
  const gpsAt = wordAt("t10", 7);
  const phoneAt = wordAt("t11", 6);
  const waAt = wordAt("t11", 11);
  const mailAt = wordAt("t11", 13);
  const fbAt = wordAt("t11", 16);
  const logoAt = wordAt("t12", 4);
  const photosAt = wordAt("t12", 8);
  const sendAt = wordAt("t13", 4);
  // Défilement du formulaire (px de l'écran)
  const scroll = interpolate(
    frame,
    [presAt - 12, presAt, gpsAt - 30, gpsAt - 18, phoneAt - 30, phoneAt - 16, logoAt - 30, logoAt - 16, sendAt - 30, sendAt - 16],
    // Positions mesurées du contenu : contacts vers 700 px, logo et photos vers 1020 px.
    [0, 250, 250, 380, 380, 640, 640, 700, 700, 700],
    clamp,
  );
  const sel = (at: number) => frame >= at && frame < at + 40;
  const gpsDone = frame >= gpsAt + 10;
  const photoTile = (i: number) => interpolate(frame, [photosAt + i * 6, photosAt + i * 6 + 8], [0, 1], clamp);
  const sending = frame >= sendAt;
  const sendLabel = !sending ? "Envoyer pour validation" : frame < sendAt + 30 ? "Optimisation des images…" : "Envoi en cours…";
  // Champ ciblé par la caméra (y à l'écran = y du contenu - défilement)
  const focusY = (y: number) => y + 82 - scroll;
  const target =
    frame < catAt
      ? 210
      : frame < presAt - 12
        ? 290
        : frame < repAt - 6
          ? 380
          : frame < gpsAt - 30
            ? 470
            : frame < phoneAt - 30
              ? 590
              : frame < waAt - 4
                ? 740
                : frame < mailAt - 4
                  ? 820
                  : frame < fbAt - 4
                    ? 900
                    : frame < logoAt - 30
                      ? 980
                      : frame < photosAt - 6
                        ? 1140
                        : frame < sendAt - 20
                          ? 1230
                          : 1305;
  const z = interpolate(frame, [START.t8! - 10, START.t8! + 6], [1, 1.32], clamp);
  return (
    <AbsoluteFill>
      <Device zoom={{ x: 195, y: Math.max(200, Math.min(700, focusY(target))), s: z }}>
        <div style={{ position: "absolute", inset: 0, background: UI.bg }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 64, padding: "18px 16px", transform: `translateY(${-scroll}px)` }}>
            <div style={UI.font(22, 800)}>Créer la fiche de mon établissement</div>
            <div style={{ ...UI.font(13, 500, UI.muted), margin: "4px 0 14px" }}>Après validation, vous pourrez gérer vos photos, votre logo et votre catalogue avec vos prix.</div>
            <Legend>Établissement</Legend>
            <Field label="Nom de l'établissement *" active={sel(nameAt)} value={frame >= nameAt ? <Typed text="Mon établissement" from={nameAt} to={nameAt + 20} /> : undefined} />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Catégorie *" active={sel(catAt)} value={frame >= catAt + 6 ? "Restaurants ▾" : undefined} placeholder="Choisir… ▾" />
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Commune ou territoire *" active={sel(comAt)} value={frame >= comAt + 6 ? "Makiso ▾" : undefined} placeholder="Choisir… ▾" />
              </div>
            </div>
            <Field
              label="Présentation courte"
              height={66}
              active={sel(presAt)}
              placeholder="Ex. Restaurant de cuisine congolaise, livraison possible."
              value={frame >= presAt ? <Typed text="Restaurant de cuisine congolaise, livraison possible." from={presAt} to={presAt + 30} /> : undefined}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Adresse" active={sel(addrAt)} value={frame >= addrAt ? <Typed text="Votre adresse" from={addrAt} to={addrAt + 12} /> : undefined} />
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Repère" active={sel(repAt)} placeholder="Ex. en face du marché central" value={frame >= repAt ? <Typed text="En face du marché central" from={repAt} to={repAt + 20} /> : undefined} />
              </div>
            </div>
            <div style={{ borderRadius: 18, background: UI.surface2, padding: 12, marginBottom: 18 }}>
              <div style={UI.font(13, 500)}>
                Position sur la carte : si vous êtes <b>dans votre établissement</b>, utilisez votre position actuelle.
              </div>
              <div style={{ marginTop: 10, height: 40, borderRadius: 20, border: `1px solid ${UI.line}`, display: "flex", alignItems: "center", justifyContent: "center", ...UI.font(13, 700, gpsDone ? C.whatsapp : "#e8eefc"), background: UI.surface }}>
                {gpsDone ? "✓ Position enregistrée" : "◎ Utiliser ma position actuelle"}
              </div>
            </div>
            <Legend>Contacts publics</Legend>
            <Field label="Téléphone public *" active={sel(phoneAt)} value={frame >= phoneAt ? <Typed text="+243 8• ••• ••••" from={phoneAt} to={phoneAt + 16} /> : undefined} />
            <Field label="WhatsApp" active={sel(waAt)} value={frame >= waAt ? <Typed text="+243 8• ••• ••••" from={waAt} to={waAt + 14} /> : undefined} />
            <Field label="E-mail" active={sel(mailAt)} value={frame >= mailAt ? <Typed text="contact@exemple.com" from={mailAt} to={mailAt + 14} /> : undefined} />
            <Field label="Site ou page Facebook" active={sel(fbAt)} value={frame >= fbAt ? <Typed text="facebook.com/votre-page" from={fbAt} to={fbAt + 16} /> : undefined} />
            <Legend>Logo et photos</Legend>
            <div style={{ ...UI.font(12, 500, UI.muted), marginBottom: 10 }}>Les images sont automatiquement réduites et optimisées avant l&apos;envoi. 3 photos maximum.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, overflow: "hidden", background: UI.surface2, opacity: interpolate(frame, [logoAt, logoAt + 8], [0.3, 1], clamp) }}>
                {frame >= logoAt && <Img src={staticFile("brand/emblem-192.webp")} style={{ width: 64, height: 64 }} />}
              </div>
              <div style={{ padding: "10px 16px", borderRadius: 20, border: `1px solid ${UI.line}`, ...UI.font(13, 700) }}>{frame >= logoAt ? "Changer le logo" : "Ajouter un logo"}</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 110,
                    height: 82,
                    borderRadius: 16,
                    background: `linear-gradient(${120 + i * 40}deg, #1e3a8a, ${["#0e7490", "#7c3aed", "#0f766e"][i]})`,
                    opacity: photoTile(i),
                    transform: `scale(${0.6 + photoTile(i) * 0.4})`,
                    display: "grid",
                    placeItems: "center",
                    ...UI.font(26, 600, "rgba(255,255,255,0.7)"),
                  }}
                >
                  ▣
                </div>
              ))}
            </div>
            <PrimaryButton pressed={sending && frame < sendAt + 6}>
              {sending && <span style={{ display: "inline-block", transform: `rotate(${frame * 12}deg)` }}>◌</span>}
              {sendLabel}
            </PrimaryButton>
            <div style={{ ...UI.font(11, 500, UI.muted), marginTop: 10 }}>
              * Champs obligatoires. Le téléphone public sera affiché sur votre fiche. Toute fiche est vérifiée par notre équipe avant publication.
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
            <AppHeader />
          </div>
          <Tap x={100} y={focusY(300)} at={catAt} />
          <Tap x={195} y={focusY(615)} at={gpsAt} />
          <Tap x={150} y={focusY(1128)} at={logoAt} />
          <Tap x={195} y={focusY(1305)} at={sendAt} />
        </div>
      </Device>
    </AbsoluteFill>
  );
}

/** Espace pro : demande en cours → fiche validée. */
function StepPro() {
  const frame = useCurrentFrame();
  const inP = useDeviceIn(START.t14! - 6);
  const validated = wordAt("t14", 8);
  const v = interpolate(frame, [validated, validated + 12], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - inP) * 1200}px)` }}>
      <Device zoom={{ x: 195, y: 300, s: 1.25 }}>
        <div style={{ position: "absolute", inset: 0, background: UI.bg }}>
          <AppHeader />
          <div style={{ padding: 16 }}>
            <div style={UI.font(22, 800)}>Espace professionnel</div>
            <div style={{ ...UI.font(13, 500, UI.muted), margin: "4px 0 14px" }}>Gérez votre établissement en ligne.</div>
            <div style={{ borderRadius: 16, padding: 12, background: "rgba(22,163,74,0.12)", ...UI.font(13, 600, "#4ade80"), marginBottom: 16, opacity: 1 - v }}>
              Fiche envoyée. Elle sera publiée après vérification par notre équipe.
            </div>
            <div style={{ ...UI.font(17, 800), marginBottom: 8 }}>{v < 0.5 ? "Demandes en cours" : "Mes établissements"}</div>
            <div style={{ borderRadius: 18, border: `1px solid ${v < 0.5 ? UI.line : C.brand}`, background: UI.surface, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <Img src={staticFile("brand/emblem-192.webp")} style={{ width: 48, height: 48, borderRadius: 14, opacity: v }} />
              <div style={{ flex: 1 }}>
                <div style={UI.font(15, 700)}>{v < 0.5 ? "Nouvelle fiche : Mon établissement" : "Mon établissement"}</div>
                <div style={UI.font(12, 500, v < 0.5 ? UI.muted : "#4ade80")}>{v < 0.5 ? "◷ En cours de validation" : "✓ Restaurants · Propriétaire"}</div>
              </div>
              <div style={UI.font(20, 600, UI.muted)}>›</div>
            </div>
          </div>
        </div>
      </Device>
    </AbsoluteFill>
  );
}

/** Gestion après validation : modules gratuits de l'Espace pro. */
function StepManage() {
  const frame = useCurrentFrame();
  const items = [
    { icon: "🕘", label: "Horaires", at: wordAt("t15", 2) },
    { icon: "🛍️", label: "Catalogue et prix", at: wordAt("t15", 5) },
    { icon: "📩", label: "Demandes des clients", at: wordAt("t15", 12) },
    { icon: "⭐", label: "Avis", at: wordAt("t15", 13) + 6 },
    { icon: "▦", label: "QR code et partage", at: wordAt("t15", 15) + 6 },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 330, ...T(64), textAlign: "center" }}>
        Ensuite, dans <span style={gradientText}>l&apos;Espace pro</span>
      </div>
      <div style={{ position: "absolute", top: 500, left: 120, right: 120, display: "flex", flexDirection: "column", gap: 22, perspective: 1400 }}>
        {items.map((it) => {
          const p = interpolate(frame, [it.at - 4, it.at + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          return (
            <div
              key={it.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "24px 32px",
                borderRadius: 34,
                background: "linear-gradient(120deg, rgba(37,99,235,0.3), rgba(6,182,212,0.12))",
                border: "2px solid rgba(255,255,255,0.14)",
                transform: `rotateY(${(1 - p) * -70}deg) translateX(${(1 - p) * -160}px)`,
                transformOrigin: "0 50%",
                opacity: p,
              }}
            >
              <span style={{ fontSize: 56 }}>{it.icon}</span>
              <span style={T(46, 700)}>{it.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const s = START.t16!;
  const p = useSpring(s - 6, { damping: 12, stiffness: 110 });
  const url = useSpring(wordAt("t16", 2) + 6);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40, paddingBottom: 260 }}>
      <Img src={staticFile("brand/emblem-720.png")} style={{ width: 300, height: 300, borderRadius: 68, transform: `scale(${0.4 + p * 0.6})`, opacity: p, boxShadow: `0 0 140px ${C.cyan}55` }} />
      <div style={{ ...T(104), opacity: p }}>
        Boyoma <span style={gradientText}>Connect</span>
      </div>
      <div style={{ ...T(46, 600, C.ink), opacity: url, textAlign: "center" }}>Votre établissement, visible dans toute la Tshopo.</div>
      <div style={{ padding: "26px 54px", borderRadius: 999, background: `linear-gradient(100deg, ${C.brand}, ${C.cyan})`, ...T(48, 800), opacity: url, transform: `scale(${0.85 + url * 0.15})` }}>
        boyoma-connect.vercel.app
      </div>
      <div style={{ ...T(40, 800, C.whatsapp), letterSpacing: "0.1em", opacity: interpolate(frame, [wordAt("t16", 9), wordAt("t16", 9) + 8], [0, 1], clamp) }}>100 % GRATUIT</div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ éléments permanents
function Progress() {
  const frame = useCurrentFrame();
  if (frame < START.t2! - 10 || frame > START.t14! + 10) return null;
  const current = [...STEPS].reverse().find((s) => frame >= START[s.from]! - 8)?.n ?? 1;
  const o = interpolate(frame, [START.t2! - 10, START.t2!, START.t14!, START.t14! + 10], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        left: 30,
        right: 30,
        padding: "22px 30px",
        borderRadius: 40,
        background: "rgba(4, 10, 30, 0.82)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        opacity: o,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {STEPS.map((s) => {
          const done = s.n < current;
          const on = s.n === current;
          return (
            <div key={s.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 150 }}>
              <div
                style={{
                  width: on ? 70 : 54,
                  height: on ? 70 : 54,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: on ? `linear-gradient(135deg, ${C.brand}, ${C.cyan})` : done ? C.whatsapp : "rgba(18,34,74,0.8)",
                  border: "2px solid rgba(255,255,255,0.18)",
                  boxShadow: on ? `0 0 40px ${C.cyan}88` : "none",
                  ...T(on ? 34 : 26, 800),
                }}
              >
                {done ? "✓" : s.n}
              </div>
              <div style={T(24, on ? 800 : 600, on ? C.white : C.muted)}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function captionTokens(l: Line) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9']/g, "");
  // Ponctuation haute et guillemets français attachés par des espaces insécables.
  const shown = l.show
    .replace(/ ([?!:;»])/g, " $1")
    .replace(/« /g, "« ")
    .split(/ +/);
  let cursor = 0;
  return shown.map((w) => {
    let idx = l.words.findIndex((s, i) => i >= cursor && i < cursor + 4 && norm(s.text) === norm(w));
    if (idx < 0) idx = Math.min(cursor, l.words.length - 1);
    cursor = idx + 1;
    return { text: w, ms: l.words[idx]?.ms ?? 0 };
  });
}

function Captions() {
  const frame = useCurrentFrame();
  const current = LINES.find((l) => frame >= START[l.id]! - 2 && frame <= endOf(l.id) + 6);
  if (!current) return null;
  const start = START[current.id]!;
  const tokens = captionTokens(current);
  const appear = interpolate(frame, [start - 2, start + 6], [0, 1], clamp);
  const leave = interpolate(frame, [endOf(current.id), endOf(current.id) + 6], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 200,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px 12px",
        padding: "20px 24px",
        borderRadius: 32,
        background: "rgba(4, 10, 30, 0.72)",
        border: "1px solid rgba(255,255,255,0.08)",
        opacity: appear * (1 - leave),
      }}
    >
      {tokens.map((t, i) => {
        const at = start + Math.round((Math.min(t.ms, current.durationMs - 150) / 1000) * FPS);
        const next = tokens[i + 1];
        const until = next ? start + Math.round((next.ms / 1000) * FPS) : endOf(current.id);
        const active = frame >= at && frame < until;
        return (
          <span
            key={i}
            style={{
              ...T(44, 800, frame >= at ? C.white : "rgba(255,255,255,0.35)"),
              padding: "4px 12px",
              borderRadius: 14,
              background: active ? `linear-gradient(100deg, ${C.brand}, ${C.cyan})` : "transparent",
            }}
          >
            {t.text}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ montage
export function Tuto() {
  const pop = [wordAt("t3", 7), wordAt("t4", 9), wordAt("t7", 8), wordAt("t13", 4)];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Audio src={staticFile("sfx/music-tuto.wav")} volume={(f) => interpolate(f, [0, 30, TUTO_FRAMES - 60, TUTO_FRAMES], [0, 0.16, 0.16, 0], clamp)} />
      {LINES.map((l) => (
        <Sequence key={l.id} from={START[l.id]!}>
          <Audio src={staticFile(`voice/${l.id}.wav`)} />
        </Sequence>
      ))}
      {STEPS.map((s) => (
        <Sequence key={`w${s.n}`} from={START[s.from]! - 12}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.35} />
        </Sequence>
      ))}
      {pop.map((f) => (
        <Sequence key={`p${f}`} from={f}>
          <Audio src={staticFile("sfx/pop.wav")} volume={0.45} />
        </Sequence>
      ))}

      <Background intensity={0.8} />
      <Part from={0} to={START.t2! - 4}>
        <Intro />
      </Part>
      <Part from={START.t2! - 8} to={START.t4! - 4}>
        <StepCheck />
      </Part>
      <Part from={START.t4! - 8} to={START.t6! - 2}>
        <StepAccount />
      </Part>
      <Part from={START.t6! - 6} to={START.t7! - 4}>
        <Confirm />
      </Part>
      <Part from={START.t7! - 8} to={START.t8! - 4}>
        <StepOpenForm />
      </Part>
      <Part from={START.t8! - 8} to={START.t14! - 4}>
        <StepForm />
      </Part>
      <Part from={START.t14! - 8} to={START.t15! - 4}>
        <StepPro />
      </Part>
      <Part from={START.t15! - 8} to={START.t16! - 4}>
        <StepManage />
      </Part>
      <Part from={START.t16! - 8} to={TUTO_FRAMES + 1}>
        <Outro />
      </Part>
      <Progress />
      <Captions />
    </AbsoluteFill>
  );
}
