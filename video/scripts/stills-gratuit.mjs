// Images de contrôle de la publicité « C'est gratuit » (3 formats) : node scripts/stills-gratuit.mjs
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const frames = (process.argv[3] ?? "70,175,330,500,680,860").split(",").map(Number);
const ids = (process.argv[2] ?? "Gratuit30-vertical,Gratuit30-carre,Gratuit30-horizontal").split(",");
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id });
  for (const frame of frames) {
    await renderStill({ composition, serveUrl, frame, output: `out/stills/${id}-${frame}.png`, scale: 0.4 });
    console.log("ok", id, frame);
  }
}
