// Images clés de contrôle (une par scène) : node scripts/stills.mjs
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const entry = path.resolve("src/index.ts");
const serveUrl = await bundle({ entryPoint: entry });
const composition = await selectComposition({ serveUrl, id: "Demo30" });
for (const frame of [135]) {
  await renderStill({ composition, serveUrl, frame, output: `out/stills/f${frame}.png`, scale: 0.5 });
  console.log("ok", frame);
}
