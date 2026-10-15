import { Composition } from "remotion";
import { Demo30, DEMO_FRAMES, FPS } from "./Demo30";
import { Gratuit30, GRATUIT_FRAMES } from "./Gratuit30";
import { Voix33, VOIX_FRAMES } from "./Voix33";
import { Tuto, TUTO_FRAMES } from "./Tuto";

export const Root = () => (
  <>
    <Composition id="Demo30" component={Demo30} durationInFrames={DEMO_FRAMES} fps={FPS} width={1080} height={1920} />
    {/* « C'est gratuit » : trois formats pour publier partout. */}
    <Composition id="Gratuit30-vertical" component={Gratuit30} durationInFrames={GRATUIT_FRAMES} fps={FPS} width={1080} height={1920} />
    <Composition id="Gratuit30-carre" component={Gratuit30} durationInFrames={GRATUIT_FRAMES} fps={FPS} width={1080} height={1080} />
    <Composition id="Gratuit30-horizontal" component={Gratuit30} durationInFrames={GRATUIT_FRAMES} fps={FPS} width={1920} height={1080} />
    {/* Voix off (Hortense), effets et nappe synthétisés : vertical. */}
    <Composition id="Voix33" component={Voix33} durationInFrames={VOIX_FRAMES} fps={FPS} width={1080} height={1920} />
    {/* Tutoriel : inscrire son établissement de A à Z (vertical, voix off). */}
    <Composition id="Tuto" component={Tuto} durationInFrames={TUTO_FRAMES} fps={FPS} width={1080} height={1920} />
  </>
);
