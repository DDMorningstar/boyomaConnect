import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Police de l'application (Plus Jakarta Sans, variable 200–800, licence SIL OFL), servie localement :
 * aucun téléchargement pendant le rendu (connexion instable).
 */
export const fontFamily = "Plus Jakarta Sans";

if (typeof document !== "undefined") {
  const handle = delayRender("Chargement de Plus Jakarta Sans");
  const faces = [
    new FontFace(fontFamily, `url(${staticFile("fonts/plus-jakarta-sans-latin.woff2")}) format("woff2")`, {
      weight: "200 800",
      unicodeRange:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    }),
    new FontFace(fontFamily, `url(${staticFile("fonts/plus-jakarta-sans-latin-ext.woff2")}) format("woff2")`, {
      weight: "200 800",
      unicodeRange: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C4, U+2C60-2C7F, U+A720-A7FF",
    }),
  ];
  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => {
      loaded.forEach((f) => document.fonts.add(f));
      continueRender(handle);
    })
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}

export const C = {
  bg: "#070f24",
  night: "#0b1736",
  surface: "#12224a",
  line: "#1e2f5a",
  brand: "#2563eb",
  brandStrong: "#1d4ed8",
  cyan: "#06b6d4",
  ink: "#e2e8f0",
  muted: "#94a3b8",
  whatsapp: "#25d366",
  white: "#ffffff",
};

export const gradientText = {
  background: `linear-gradient(100deg, ${C.brand} 0%, ${C.cyan} 100%)`,
  WebkitBackgroundClip: "text" as const,
  backgroundClip: "text" as const,
  color: "transparent",
};
