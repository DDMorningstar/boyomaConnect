import type { ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, fontFamily, gradientText } from "./theme";
import {
  Background,
  Caption,
  clamp,
  Glass,
  IconChat,
  IconCheck,
  IconImage,
  IconNav,
  IconPhone,
  IconPin,
  IconRoute,
  IconSearch,
  LogoMark,
  Phone,
  RevealWord,
  SceneFade,
  useSpring,
} from "./ui/kit";

/**
 * Publicité « Démo 30 s » de Boyoma Connect — vertical 1080 × 1920, 30 i/s.
 * Uniquement de vraies captures de l'application en production et de vrais chiffres
 * (233 lieux publiés, Kisangani + 7 territoires de la Tshopo, au 12/10/2026).
 */
export const FPS = 30;
export const DEMO_FRAMES = 900;

const PLACE_FULL_RATIO = 3519 / 1170; // capture pleine page de la fiche (hauteur / largeur)

function Scene({ from, duration, children }: { from: number; duration: number; children: ReactNode }) {
  return (
    <Sequence from={from} durationInFrames={duration}>
      <SceneFade duration={duration}>{children}</SceneFade>
    </Sequence>
  );
}

// ------------------------------------------------------------------ 1. accroche
function Hook() {
  const frame = useCurrentFrame();
  const sub = useSpring(58);
  const rings = [0, 14, 28];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {rings.map((d) => {
        const p = interpolate(frame - d, [0, 70], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              width: 300 + p * 900,
              height: 300 + p * 900,
              borderRadius: "50%",
              border: `3px solid ${C.cyan}`,
              opacity: (1 - p) * 0.45,
            }}
          />
        );
      })}
      <div style={{ textAlign: "center", lineHeight: 1 }}>
        <div>
          <RevealWord delay={2} size={128}>
            Une
          </RevealWord>{" "}
          <RevealWord delay={6} size={128} gradient>
            pharmacie ?
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={20} size={128}>
            Un
          </RevealWord>{" "}
          <RevealWord delay={24} size={128} gradient>
            hôtel ?
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={38} size={128}>
            Un
          </RevealWord>{" "}
          <RevealWord delay={42} size={128} gradient>
            garage ?
          </RevealWord>
        </div>
        <p
          style={{
            marginTop: 56,
            fontFamily,
            fontWeight: 500,
            fontSize: 48,
            color: C.muted,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 24}px)`,
          }}
        >
          Où ? Quel numéro ? Comment y aller ?
        </p>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 2. logo
function Brand() {
  const frame = useCurrentFrame();
  const p = useSpring(0, { damping: 12, stiffness: 110 });
  const tag = useSpring(24);
  const pulse = interpolate(frame % 40, [0, 40], [0, 1]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 48 }}>
      <div style={{ position: "relative", transform: `scale(${0.5 + p * 0.5}) rotate(${(1 - p) * -18}deg)` }}>
        <div
          style={{
            position: "absolute",
            inset: -60 - pulse * 60,
            borderRadius: 120,
            border: `4px solid ${C.cyan}`,
            opacity: (1 - pulse) * 0.5,
          }}
        />
        <div style={{ filter: `drop-shadow(0 0 80px ${C.brand})` }}>
          <LogoMark size={260} />
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <RevealWord delay={8} size={116}>
          Boyoma
        </RevealWord>{" "}
        <RevealWord delay={12} size={116} gradient>
          Connect
        </RevealWord>
      </div>
      <p
        style={{
          margin: 0,
          fontFamily,
          fontWeight: 500,
          fontSize: 46,
          color: C.ink,
          opacity: tag,
          letterSpacing: "0.01em",
        }}
      >
        Votre ville. Vos adresses. Votre chemin.
      </p>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 3. recherche
function Search() {
  const frame = useCurrentFrame();
  const enter = useSpring(6, { damping: 20, stiffness: 90 });
  const count = Math.round(interpolate(frame, [14, 62], [0, 233], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const swap = interpolate(frame, [88, 104], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const sub = useSpring(20);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 240, left: 60, right: 60, textAlign: "center" }}>
        <RevealWord delay={0} size={84}>
          Cherchez parmi
        </RevealWord>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 150, letterSpacing: "-0.04em", lineHeight: 1.05, ...gradientText }}>
          {count} lieux
        </div>
        <p style={{ margin: "6px 0 0", fontFamily, fontWeight: 500, fontSize: 38, color: C.muted, opacity: sub }}>
          Kisangani et les 7 territoires de la Tshopo
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 700,
          transform: `translateX(-50%) translateY(${(1 - enter) * 700}px)`,
        }}
      >
        <Phone src="home.png" width={600} rotateY={-10 + enter * 4} rotateX={6}>
          <Img
            src={staticFile("screens/search.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              transform: `translateX(${(1 - swap) * 100}%)`,
              boxShadow: "-40px 0 80px rgba(0,0,0,0.5)",
            }}
          />
        </Phone>
      </div>
      <div style={{ position: "absolute", top: 1010, left: 40 }}>
        <Glass delay={96} from="left">
          <IconSearch /> « hotel »
        </Glass>
      </div>
      <div style={{ position: "absolute", top: 1180, right: 40 }}>
        <Glass delay={110} from="right" style={{ color: C.white }}>
          <IconCheck color={C.cyan} /> 10 lieux trouvés
        </Glass>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 4. fiche
function PlaceSheet() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 20, stiffness: 100 });
  const scroll = interpolate(frame, [30, 150], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const callouts: { at: number; top: number; side: "left" | "right"; icon: ReactNode; text: string }[] = [
    { at: 22, top: 820, side: "left", icon: <IconCheck color="#22c55e" />, text: "Fiche gérée par l'établissement" },
    { at: 62, top: 1060, side: "right", icon: <IconPin color={C.cyan} />, text: "Position GPS précise" },
    { at: 98, top: 1300, side: "left", icon: <IconRoute color={C.cyan} />, text: "Repères pour s'y rendre" },
    { at: 128, top: 1540, side: "right", icon: <IconImage color={C.cyan} />, text: "Catalogue, prix et photos" },
  ];
  return (
    <AbsoluteFill>
      <Caption title="Toutes les infos," accent="sur une fiche" sub="Contacts, position, catalogue avec prix" />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 640,
          transform: `translateX(-50%) scale(${0.9 + enter * 0.1})`,
          opacity: enter,
        }}
      >
        <Phone src="place-full.png" width={580} fullHeightRatio={PLACE_FULL_RATIO} scroll={scroll} rotateY={8} rotateX={4} />
      </div>
      {callouts.map((c) => (
        <div key={c.text} style={{ position: "absolute", top: c.top, [c.side]: 30 }}>
          <Glass delay={c.at} from={c.side} style={{ fontSize: 34, padding: "18px 28px" }}>
            {c.icon} {c.text}
          </Glass>
        </div>
      ))}
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 5. actions
function ActionButton({
  delay,
  color,
  label,
  children,
}: {
  delay: number;
  color: string;
  label: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const p = useSpring(delay, { damping: 11, stiffness: 160 });
  const tap = interpolate(frame - delay - 14, [0, 22], [0, 1], clamp);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, transform: `scale(${p})` }}>
      <div style={{ position: "relative", width: 170, height: 170 }}>
        <div
          style={{
            position: "absolute",
            inset: -tap * 60,
            borderRadius: "50%",
            border: `4px solid ${color}`,
            opacity: tap > 0 ? (1 - tap) * 0.8 : 0,
          }}
        />
        <div
          style={{
            width: 170,
            height: 170,
            borderRadius: "50%",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 30px 80px ${color}66`,
            transform: `scale(${1 - Math.sin(tap * Math.PI) * 0.08})`,
          }}
        >
          {children}
        </div>
      </div>
      <span style={{ fontFamily, fontWeight: 700, fontSize: 38, color: C.white }}>{label}</span>
    </div>
  );
}

function Actions() {
  const enter = useSpring(0, { damping: 20, stiffness: 100 });
  return (
    <AbsoluteFill>
      <Caption title="Un geste pour" accent="appeler ou y aller" sub="Directement depuis la fiche du lieu" />
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 660,
          transform: `translateX(${(1 - enter) * -300}px)`,
          opacity: enter,
        }}
      >
        <Phone src="place-sticky.png" width={520} rotateY={14} rotateX={4} />
      </div>
      <div
        style={{
          position: "absolute",
          right: 70,
          top: 760,
          display: "flex",
          flexDirection: "column",
          gap: 56,
          alignItems: "center",
        }}
      >
        <ActionButton delay={16} color={C.brand} label="Appeler">
          <IconPhone size={76} />
        </ActionButton>
        <ActionButton delay={34} color={C.whatsapp} label="WhatsApp">
          <IconChat size={76} />
        </ActionButton>
        <ActionButton delay={52} color={C.surface} label="Itinéraire">
          <IconNav size={76} />
        </ActionButton>
      </div>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 6. carte
const TERRITOIRES = ["Bafwasende", "Banalia", "Basoko", "Isangi", "Opala", "Ubundu", "Yahuma"];

function MapScene() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 20, stiffness: 100 });
  const zoom = interpolate(frame, [0, 150], [1.12, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const credit = useSpring(30);
  return (
    <AbsoluteFill>
      <Caption title="Toute la" accent="Tshopo" sub="Kisangani et 7 territoires, sur la carte" />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 640,
          transform: `translateX(-50%) scale(${0.92 + enter * 0.08})`,
          opacity: enter,
        }}
      >
        <Phone src="map-tshopo.png" width={520} rotateX={8}>
          <Img
            src={staticFile("screens/map-tshopo.png")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: `scale(${zoom})` }}
          />
        </Phone>
      </div>
      {TERRITOIRES.map((t, i) => {
        const left = i % 2 === 0;
        return (
          <div key={t} style={{ position: "absolute", top: 780 + i * 135, [left ? "left" : "right"]: 34 }}>
            <Glass delay={18 + i * 9} from={left ? "left" : "right"} style={{ fontSize: 32, padding: "14px 26px" }}>
              <IconPin size={34} color={C.cyan} /> {t}
            </Glass>
          </div>
        );
      })}
      <p
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          margin: 0,
          padding: "10px 22px",
          borderRadius: 999,
          background: "rgba(7, 15, 36, 0.85)",
          whiteSpace: "nowrap",
          fontFamily,
          fontWeight: 500,
          fontSize: 22,
          color: C.muted,
          opacity: credit,
        }}
      >
        Carte : OpenFreeMap © OpenMapTiles · données © contributeurs OpenStreetMap
      </p>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ 7. appel à l'action
function Cta() {
  const frame = useCurrentFrame();
  const logo = useSpring(0);
  const url = useSpring(46, { damping: 14, stiffness: 120 });
  const sweep = interpolate(frame, [60, 110], [-120, 220], clamp);
  const facts = ["Gratuit", "Sans inscription", "S'installe comme une app"];
  const pro = useSpring(104);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 260, transform: `scale(${logo})` }}>
        <LogoMark size={150} />
      </div>
      <div style={{ marginTop: 40, textAlign: "center", lineHeight: 1 }}>
        <div>
          <RevealWord delay={8} size={136}>
            Trouvez.
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={18} size={136}>
            Appelez.
          </RevealWord>
        </div>
        <div>
          <RevealWord delay={28} size={136} gradient>
            Allez-y.
          </RevealWord>
        </div>
      </div>
      <div
        style={{
          marginTop: 70,
          position: "relative",
          overflow: "hidden",
          padding: "34px 56px",
          borderRadius: 999,
          background: `linear-gradient(100deg, ${C.brand}, ${C.cyan})`,
          boxShadow: `0 40px 120px ${C.brand}88`,
          transform: `scale(${url})`,
          fontFamily,
          fontWeight: 800,
          fontSize: 54,
          color: C.white,
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
            width: "40%",
            background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent)",
            transform: "skewX(-20deg)",
          }}
        />
      </div>
      <div style={{ marginTop: 56, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, padding: "0 60px" }}>
        {facts.map((f, i) => (
          <Glass key={f} delay={66 + i * 10} style={{ fontSize: 34, padding: "16px 28px" }}>
            <IconCheck size={36} color={C.cyan} /> {f}
          </Glass>
        ))}
      </div>
      <p
        style={{
          marginTop: 60,
          fontFamily,
          fontWeight: 700,
          fontSize: 40,
          color: C.ink,
          opacity: pro,
          transform: `translateY(${(1 - pro) * 20}px)`,
          textAlign: "center",
        }}
      >
        Commerçants : <span style={gradientText}>ajoutez votre établissement</span>
      </p>
    </AbsoluteFill>
  );
}

// ------------------------------------------------------------------ montage
function ProgressBar() {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        height: 8,
        width: `${(frame / DEMO_FRAMES) * 100}%`,
        background: `linear-gradient(90deg, ${C.brand}, ${C.cyan})`,
        boxShadow: `0 0 24px ${C.cyan}`,
      }}
    />
  );
}

export function Demo30() {
  return (
    <AbsoluteFill style={{ fontFamily, background: C.bg }}>
      <Background />
      <Scene from={0} duration={100}>
        <Hook />
      </Scene>
      <Scene from={90} duration={80}>
        <Brand />
      </Scene>
      <Scene from={160} duration={175}>
        <Search />
      </Scene>
      <Scene from={325} duration={175}>
        <PlaceSheet />
      </Scene>
      <Scene from={490} duration={135}>
        <Actions />
      </Scene>
      <Scene from={615} duration={150}>
        <MapScene />
      </Scene>
      <Sequence from={755} durationInFrames={145}>
        <SceneFade duration={145} fadeOut={1}>
          <Cta />
        </SceneFade>
      </Sequence>
      <ProgressBar />
    </AbsoluteFill>
  );
}
