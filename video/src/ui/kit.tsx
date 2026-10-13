import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, fontFamily, gradientText } from "../theme";

// ------------------------------------------------------------------ outils
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Ressort normalisé démarrant à `delay` (images). */
export function useSpring(delay = 0, config: { damping?: number; mass?: number; stiffness?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.9, stiffness: 140, ...config } });
}

// ------------------------------------------------------------------ fond
/** Nuit de Kisangani : halos bleu/cyan en dérive, grille en perspective, grain. */
export function Background({ intensity = 1 }: { intensity?: number }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const orb = (x: number, y: number, size: number, color: string, phase: number): CSSProperties => ({
    position: "absolute",
    left: x + Math.sin(t * 0.5 + phase) * 90,
    top: y + Math.cos(t * 0.4 + phase) * 110,
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    filter: "blur(140px)",
    opacity: 0.55 * intensity,
  });
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={orb(-260, -120, 900, C.brand, 0)} />
      <div style={orb(520, 980, 820, C.cyan, 2)} />
      <div style={orb(380, 360, 520, "#7c3aed", 4)} />
      {/* Grille en perspective, qui avance lentement. */}
      <div
        style={{
          position: "absolute",
          left: -540,
          right: -540,
          bottom: -200,
          height: 1100,
          transform: "perspective(900px) rotateX(64deg)",
          transformOrigin: "50% 100%",
          backgroundImage: `linear-gradient(${C.line}88 2px, transparent 2px), linear-gradient(90deg, ${C.line}88 2px, transparent 2px)`,
          backgroundSize: "120px 120px",
          backgroundPosition: `0 ${(frame * 2) % 120}px`,
          maskImage: "linear-gradient(to top, black 10%, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 85%)",
          opacity: 0.55,
        }}
      />
      <svg style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay" }} width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 7} />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ logo
export function LogoMark({ size = 160 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs>
        <linearGradient id="bc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.brand} />
          <stop offset="1" stopColor={C.cyan} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={C.night} />
      <path d="M24 9c-6.6 0-12 5.2-12 11.7C12 29.5 24 40 24 40s12-10.5 12-19.3C36 14.2 30.6 9 24 9Z" fill="url(#bc-g)" />
      <circle cx="24" cy="21" r="4.6" fill={C.night} />
    </svg>
  );
}

// ------------------------------------------------------------------ texte
/** Mot révélé par un masque (glisse depuis le bas) avec un léger flou. */
export function RevealWord({
  children,
  delay,
  size = 120,
  gradient = false,
  weight = 800,
}: {
  children: ReactNode;
  delay: number;
  size?: number;
  gradient?: boolean;
  weight?: number;
}) {
  const p = useSpring(delay, { damping: 16, stiffness: 120 });
  return (
    <span
      style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.04em", margin: "0 0.11em", fontSize: size, verticalAlign: "bottom" }}
    >
      <span
        style={{
          display: "inline-block",
          fontFamily,
          fontWeight: weight,
          fontSize: size,
          lineHeight: 1.04,
          letterSpacing: "-0.035em",
          color: C.white,
          transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 4}deg)`,
          filter: `blur(${(1 - p) * 10}px)`,
          ...(gradient ? gradientText : {}),
        }}
      >
        {children}
      </span>
    </span>
  );
}

/** Pastille « verre » (fond flouté, liseré lumineux). */
export function Glass({
  children,
  style,
  delay = 0,
  from = "bottom",
}: {
  children: ReactNode;
  style?: CSSProperties;
  delay?: number;
  from?: "bottom" | "left" | "right";
}) {
  const p = useSpring(delay);
  const d = (1 - p) * 60;
  const offset = from === "left" ? `translateX(${-d}px)` : from === "right" ? `translateX(${d}px)` : `translateY(${d}px)`;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 18,
        padding: "22px 34px",
        borderRadius: 999,
        background: "rgba(18, 34, 74, 0.55)",
        border: "2px solid rgba(255,255,255,0.12)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
        backdropFilter: "blur(24px)",
        fontFamily,
        fontWeight: 700,
        fontSize: 40,
        color: C.white,
        opacity: p,
        transform: `${offset} scale(${0.9 + p * 0.1})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Légende de scène (titre + sous-titre) dans la zone sûre haute des réseaux sociaux. */
export function Caption({
  title,
  accent,
  sub,
  delay = 0,
  top = 250,
}: {
  title: string;
  accent?: string;
  sub?: string;
  delay?: number;
  top?: number;
}) {
  const p = useSpring(delay + 10);
  return (
    <div style={{ position: "absolute", top, left: 70, right: 70, textAlign: "center" }}>
      <div>
        <RevealWord delay={delay} size={84}>
          {title}
        </RevealWord>
        {accent && (
          <>
            {" "}
            <RevealWord delay={delay + 5} size={84} gradient>
              {accent}
            </RevealWord>
          </>
        )}
      </div>
      {sub && (
        <p
          style={{
            margin: "18px 0 0",
            fontFamily,
            fontWeight: 500,
            fontSize: 38,
            color: C.muted,
            opacity: p,
            transform: `translateY(${(1 - p) * 20}px)`,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ téléphone
/**
 * Téléphone en 3D (écran = capture réelle de l'application). `scroll` fait défiler une capture pleine
 * page (0 → 1) ; `children` permet de superposer des éléments à l'écran.
 */
export function Phone({
  src,
  width = 620,
  scroll = 0,
  fullHeightRatio,
  rotateY = 0,
  rotateX = 0,
  style,
  children,
}: {
  src: string;
  width?: number;
  scroll?: number;
  /** Hauteur de la capture / largeur (pour défiler une capture pleine page). */
  fullHeightRatio?: number;
  rotateY?: number;
  rotateX?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ratio = 844 / 390;
  const height = width * ratio;
  const bezel = 22;
  const imgHeight = fullHeightRatio ? width * fullHeightRatio : height;
  const maxShift = Math.max(0, imgHeight - height);
  return (
    <div style={{ perspective: 2400, ...style }}>
      <div
        style={{
          width: width + bezel * 2,
          height: height + bezel * 2,
          padding: bezel,
          borderRadius: 96,
          background: "linear-gradient(145deg, #1f2a44, #05070d 60%)",
          boxShadow:
            "0 80px 160px rgba(0,0,0,0.65), 0 0 0 3px rgba(255,255,255,0.06), inset 0 0 0 2px rgba(255,255,255,0.08), 0 0 120px rgba(37,99,235,0.25)",
          transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <div style={{ position: "relative", width, height, borderRadius: 76, overflow: "hidden", background: C.bg }}>
          <Img
            src={staticFile(`screens/${src}`)}
            style={{ position: "absolute", left: 0, top: -maxShift * scroll, width, height: imgHeight }}
          />
          {/* Îlot de l'appareil */}
          <div
            style={{
              position: "absolute",
              top: 18,
              left: "50%",
              width: 170,
              height: 46,
              marginLeft: -85,
              borderRadius: 30,
              background: "#000",
            }}
          />
          {/* Reflet */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.04) 100%)",
              pointerEvents: "none",
            }}
          />
          {children}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ icônes (tracés type Lucide)
const icon = (d: ReactNode, size: number, color: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
export const IconPhone = ({ size = 56, color = C.white }) =>
  icon(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />, size, color);
export const IconChat = ({ size = 56, color = C.white }) =>
  icon(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />, size, color);
export const IconNav = ({ size = 56, color = C.white }) => icon(<polygon points="3 11 22 2 13 21 11 13 3 11" />, size, color);
export const IconSearch = ({ size = 44, color = C.white }) =>
  icon(
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>,
    size,
    color,
  );
export const IconPin = ({ size = 44, color = C.white }) =>
  icon(
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>,
    size,
    color,
  );
export const IconCheck = ({ size = 44, color = C.white }) => icon(<path d="M20 6 9 17l-5-5" />, size, color);
export const IconImage = ({ size = 44, color = C.white }) =>
  icon(
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </>,
    size,
    color,
  );
export const IconRoute = ({ size = 44, color = C.white }) =>
  icon(
    <>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </>,
    size,
    color,
  );

/** Transition d'entrée/sortie d'une scène : zoom + flou + fondu. */
export function SceneFade({ children, duration, fadeIn = 12, fadeOut = 12 }: { children: ReactNode; duration: number; fadeIn?: number; fadeOut?: number }) {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [0, fadeIn], [0, 1], clamp);
  const outP = interpolate(frame, [duration - fadeOut, duration], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity: inP * (1 - outP),
        transform: `scale(${1.04 - inP * 0.04 + outP * 0.06})`,
        filter: `blur(${(1 - inP) * 14 + outP * 18}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}
