import { Composition } from "remotion";
import { Demo30, DEMO_FRAMES, FPS } from "./Demo30";

export const Root = () => (
  <Composition id="Demo30" component={Demo30} durationInFrames={DEMO_FRAMES} fps={FPS} width={1080} height={1920} />
);
