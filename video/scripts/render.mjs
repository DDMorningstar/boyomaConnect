// Rendu robuste : le bundle est préparé dans out/.bundle (et non dans le dossier Temp de Windows,
// qui peut être nettoyé pendant un long rendu). Accélération graphique (angle).
//   node scripts/render.mjs <composition> <fichier.mp4>
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { rmSync } from "node:fs";
import path from "node:path";

const [id, output] = process.argv.slice(2);
if (!id || !output) {
  console.error("Usage : node scripts/render.mjs <composition> <fichier.mp4>");
  process.exit(2);
}
const outDir = path.resolve("out/.bundle");
rmSync(outDir, { recursive: true, force: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), outDir });
const chromiumOptions = { gl: "angle" };
const composition = await selectComposition({ serveUrl, id, chromiumOptions });
let last = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: 18,
  audioCodec: "aac",
  outputLocation: path.resolve(output),
  chromiumOptions,
  onProgress: ({ renderedFrames, progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct !== last && pct % 5 === 0) {
      last = pct;
      console.log(`${pct} % (${renderedFrames}/${composition.durationInFrames} images)`);
    }
  },
});
console.log("Terminé :", output);
