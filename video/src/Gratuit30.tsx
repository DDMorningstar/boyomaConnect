import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, fontFamily, gradientText } from "./theme";
import {
  Background,
  clamp,
  IconChat,
  IconCheck,
  IconImage,
  IconNav,
  IconPhone,
  IconPin,
  IconSearch,
  Phone,
  RevealWord,
  SceneFade,
  useSpring,
} from "./ui/kit";

/**
 * Publicité « C'est gratuit » (30 s) — décliné en 9:16, 1:1 et 16:9.
 * Aucune mention de paiement. Uniquement de vraies captures et de vrais chiffres
 * (233 lieux publiés, 44 catégories, Kisangani + 7 territoires de la Tshopo, au 14/10/2026).
 */
export const GRATUIT_FRAMES = 900;

type Layout = "portrait" | "square" | "landscape";
function useLayout(): { layout: Layout; w: number; h: number } {
  const { width: w, height: h } = useVideoConfig();
  return { layout: h > w * 1.2 ? "portrait" : w > h * 1.2 ? "landscape" : "square", w, h };
}

function Scene({ from, duration, children }: { from: number; duration: number; children: ReactNode }) {
  return (
    <Sequence from={from} durationInFrames={duration}>
      <SceneFade duration={duration}>{children}</SceneFade>
    </Sequence>
  );
}

const text = (size: number, weight = 800, color: string = C.white): CSSProperties => ({
  fontFamily,
  fontWeight: weight,
  fontSize: size,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  color,
  margin: 0,
});

/** Pictogramme officiel (épingle connectée) avec halo pulsé. */
function Emblem({ size, delay = 0 }: { size: number; delay?: number }) {
  const frame = useCurrentFrame();
  const p = useSpring(delay, { damping: 13, stiffness: 110 });
  const glow = 0.55 + Math.sin((frame - delay) / 9) * 0.15;
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `scale(${0.4 + p * 0.6})`, opacity: p }}>
      <div
        style={{
          position: "absolute",
          inset: -size * 0.25,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${C.cyan}66 0%, transparent 65%)`,
          opacity: glow,
          filter: "blur(30px)",
        }}
      />
      <Img
        src={staticFile("brand/emblem-720.png")}
        style={{ position: "relative", width: size, height: size, borderRadius: size * 0.22, boxShadow: `0 30px 90px rgba(0,0,0,0.5)` }}
      />
    </div>
  );
}

/** Ligne d'avantage : coche + texte, entrée latérale. */
function Benefit({ icon, children, delay, size = 46 }: { icon: ReactNode; children: ReactNode; delay: number; size?: number }) {
  const p = useSpring(delay);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.5,
        opacity: p,
        transform: `translateX(${(1 - p) * -70}px)`,
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: size * 1.7,
          height: size * 1.7,
          borderRadius: size * 0.5,
          background: `linear-gradient(135deg, ${C.brand}, ${C.cyan})`,
          boxShadow: `0 14px 40px ${C.brand}66`,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={text(size, 700)}>{children}</span>
    </div>
  );
}

/** Tampon « GRATUIT » qui s'imprime. */
function Stamp({ delay, size }: { delay: number; size: number }) {
  const p = useSpring(delay, { damping: 10, stiffness: 180, mass: 0.7 });
  return (
    <div
      style={{
        display: "inline-block",
        padding: `${size * 0.12}px ${size * 0.4}px`,
        border: `${size * 0.07}px solid ${C.whatsapp}`,
        borderRadius: size * 0.22,
        color: C.whatsapp,
        fontFamily,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: "0.06em",
        transform: `rotate(-8deg) scale(${2.4 - p * 1.4})`,
        opacity: Math.min(1, p * 1.6),
        boxShadow: `0 0 60px ${C.whatsapp}55, inset 0 0 30px ${C.whatsapp}33`,
        textShadow: `0 0 30px ${C.whatsapp}88`,
      }}
    >
      GRATUIT
    </div>
  );
}

// ------------------------------------------------------------------ 1. accroche « 0 FC »
function Hook() {
  const { layout } = useLayout();
  const frame = useCurrentFrame();
  const big = layout === "landscape" ? 300 : 360;
  const q = layout === "portrait" ? 78 : 70;
  // Compteur qui dégringole jusqu'à 0.
  const count = Math.round(interpolate(frame, [26, 52], [25000, 0], { ...clamp, easing: Easing.in(Easing.cubic) }));
  const pop = useSpring(52, { damping: 9, stiffness: 200 });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: 80 }}>
      <div style={{ maxWidth: layout === "landscape" ? 1500 : 940 }}>
        <div>
          <RevealWord delay={0} size={q}>
            Trouver une adresse
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={6} size={q}>
            à
          </RevealWord>{" "}
          <RevealWord delay={9} size={q} gradient>
            Kisangani,
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={14} size={q}>
            ça coûte combien ?
          </RevealWord>
        </div>
      </div>
      <div
        style={{
          ...text(big, 800),
          marginTop: 30,
          fontVariantNumeric: "tabular-nums",
          transform: `scale(${frame >= 52 ? 0.85 + pop * 0.15 : 1})`,
          opacity: interpolate(frame, [22, 30], [0, 1], clamp),
          ...(frame >= 52 ? gradientText : {}),
        }}
      >
        {count.toLocaleString("fr-FR")} FC
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 2. « Rien. C'est gratuit. » + logo
function Reveal() {
  const { layout } = useLayout();
  const slogan = useSpring(52);
  const em = layout === "landscape" ? 300 : 340;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 40 }}>
      <div>
        <RevealWord delay={0} size={110}>
          Rien.
        </RevealWord>
      </div>
      <Stamp delay={10} size={layout === "landscape" ? 110 : 130} />
      <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 30, flexDirection: layout === "portrait" ? "column" : "row" }}>
        <Emblem size={layout === "portrait" ? em : 200} delay={30} />
        <div style={{ textAlign: layout === "portrait" ? "center" : "left" }}>
          <div style={{ ...text(layout === "portrait" ? 92 : 84), opacity: slogan }}>
            Boyoma <span style={gradientText}>Connect</span>
          </div>
          <p style={{ ...text(38, 500, C.muted), marginTop: 14, opacity: slogan, transform: `translateY(${(1 - slogan) * 20}px)` }}>
            Toute la Tshopo, à portée de main.
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ gabarit « texte + téléphone »
function Split({
  title,
  accent,
  phone,
  children,
  phoneDelay = 6,
}: {
  title: string;
  accent: string;
  phone: ReactNode;
  children: ReactNode;
  phoneDelay?: number;
}) {
  const { layout, h } = useLayout();
  const frame = useCurrentFrame();
  const ph = useSpring(phoneDelay, { damping: 20, stiffness: 90 });
  const float = Math.sin(frame / 22) * 10;
  const titleBlock = (size: number) => (
    <div>
      <RevealWord delay={0} size={size}>
        {title}
      </RevealWord>{" "}
      <RevealWord delay={5} size={size} gradient>
        {accent}
      </RevealWord>
    </div>
  );
  if (layout === "landscape") {
    return (
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120, padding: "0 140px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 40 }}>
          {titleBlock(88)}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>{children}</div>
        </div>
        <div style={{ transform: `translateY(${(1 - ph) * 300 + float}px) rotate(${(1 - ph) * 6}deg)`, opacity: ph }}>{phone}</div>
      </AbsoluteFill>
    );
  }
  if (layout === "square") {
    return (
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 50, padding: "0 70px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 34 }}>
          {titleBlock(70)}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>{children}</div>
        </div>
        <div style={{ transform: `translateY(${(1 - ph) * 300 + float}px)`, opacity: ph }}>{phone}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 230 }}>
      <div style={{ textAlign: "center", padding: "0 60px" }}>{titleBlock(86)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 44, alignSelf: "stretch", padding: "0 110px" }}>
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          top: h * 0.53,
          transform: `translateY(${(1 - ph) * 500 + float}px) rotate(${(1 - ph) * -5}deg)`,
          opacity: ph,
        }}
      >
        {phone}
      </div>
    </AbsoluteFill>
  );
}

function phoneWidth(layout: Layout) {
  return layout === "landscape" ? 370 : layout === "square" ? 330 : 520;
}

// ------------------------------------------------------------------ 3. visiteurs
function Visitors() {
  const { layout } = useLayout();
  const s = layout === "portrait" ? 44 : 40;
  const ic = s * 0.95;
  return (
    <Split
      title="Cherchez,"
      accent="trouvez."
      phone={<Phone src="search.png" width={phoneWidth(layout)} />}
    >
      <Benefit delay={16} size={s} icon={<IconSearch size={ic} />}>
        Pharmacies, hôtels, garages…
      </Benefit>
      <Benefit delay={26} size={s} icon={<IconPhone size={ic} />}>
        Appel et WhatsApp directs
      </Benefit>
      <Benefit delay={36} size={s} icon={<IconNav size={ic} />}>
        Itinéraire en un geste
      </Benefit>
      <Benefit delay={46} size={s} icon={<IconCheck size={ic} />}>
        Sans inscription
      </Benefit>
    </Split>
  );
}

// ------------------------------------------------------------------ 4. chiffres réels sur la carte
function Chip({ delay, big, small, portrait }: { delay: number; big: string; small: string; portrait: boolean }) {
  const p = useSpring(delay);
  return (
    <div
      style={{
        padding: "22px 30px",
        borderRadius: 30,
        background: "rgba(18, 34, 74, 0.6)",
        border: "2px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(20px)",
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px) scale(${0.92 + p * 0.08})`,
      }}
    >
      <div style={{ ...text(portrait ? 64 : 58), ...gradientText }}>{big}</div>
      <div style={text(28, 600, C.muted)}>{small}</div>
    </div>
  );
}

function Coverage() {
  const { layout } = useLayout();
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [14, 60], [0, 200], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const portrait = layout === "portrait";
  return (
    <Split title="Toute la" accent="Tshopo." phone={<Phone src="zone.png" width={phoneWidth(layout)} />} phoneDelay={4}>
      <div style={{ display: "grid", gridTemplateColumns: portrait ? "1fr 1fr" : "1fr", gap: 18 }}>
        <Chip delay={10} big={`${n}+`} small="lieux déjà référencés" portrait={portrait} />
        <Chip delay={20} big="44" small="catégories" portrait={portrait} />
        <div style={{ gridColumn: portrait ? "1 / -1" : undefined }}>
          <Chip delay={30} big="Kisangani" small="+ 7 territoires de la Tshopo" portrait={portrait} />
        </div>
      </div>
    </Split>
  );
}

// ------------------------------------------------------------------ 5. établissements
function Businesses() {
  const { layout } = useLayout();
  const s = layout === "portrait" ? 42 : 38;
  const ic = s * 0.95;
  const intro = useSpring(0);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: layout === "portrait" ? 150 : layout === "square" ? 60 : 70,
          left: 0,
          right: 0,
          textAlign: "center",
          ...text(34, 600, C.cyan),
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: intro,
        }}
      >
        Vous avez un établissement ?
      </div>
      <Split
        title="Votre fiche est"
        accent="gratuite."
        phone={<Phone src="place.png" width={phoneWidth(layout)} />}
      >
        <Benefit delay={18} size={s} icon={<IconImage size={ic} />}>
          Photos et logo
        </Benefit>
        <Benefit delay={28} size={s} icon={<IconChat size={ic} />}>
          Téléphone et WhatsApp
        </Benefit>
        <Benefit delay={38} size={s} icon={<IconPin size={ic} />}>
          Catalogue produits et services
        </Benefit>
        <Benefit delay={48} size={s} icon={<IconCheck size={ic} />}>
          Horaires et itinéraire
        </Benefit>
      </Split>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 6. appel à l'action
function Outro() {
  const { layout } = useLayout();
  const frame = useCurrentFrame();
  const url = useSpring(40);
  const sweep = interpolate(frame, [50, 110], [-30, 130], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: layout === "landscape" ? 30 : 46 }}>
      <Emblem size={layout === "landscape" ? 240 : layout === "square" ? 230 : 320} delay={0} />
      <div style={text(layout === "portrait" ? 96 : 84)}>
        Boyoma <span style={gradientText}>Connect</span>
      </div>
      <div>
        <RevealWord delay={14} size={layout === "portrait" ? 76 : 66}>
          100 %
        </RevealWord>{" "}
        <RevealWord delay={18} size={layout === "portrait" ? 76 : 66} gradient>
          gratuit.
        </RevealWord>
      </div>
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "26px 48px",
          borderRadius: 999,
          background: `linear-gradient(100deg, ${C.brand}, ${C.cyan})`,
          boxShadow: `0 30px 80px ${C.brand}77`,
          opacity: url,
          transform: `translateY(${(1 - url) * 40}px) scale(${0.9 + url * 0.1})`,
          ...text(layout === "portrait" ? 46 : 42, 800),
          letterSpacing: "-0.01em",
        }}
      >
        boyoma-connect.vercel.app
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep}%`,
            width: "18%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
            transform: "skewX(-20deg)",
          }}
        />
      </div>
      <p style={{ ...text(34, 500, C.muted), opacity: url }}>Toute la Tshopo, à portée de main.</p>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ montage
export function Gratuit30() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      <Scene from={0} duration={95}>
        <Hook />
      </Scene>
      <Scene from={90} duration={125}>
        <Reveal />
      </Scene>
      <Scene from={210} duration={185}>
        <Visitors />
      </Scene>
      <Scene from={390} duration={155}>
        <Coverage />
      </Scene>
      <Scene from={540} duration={185}>
        <Businesses />
      </Scene>
      <Sequence from={720} durationInFrames={180}>
        <SceneFade duration={180} fadeOut={1}>
          <Outro />
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
}
