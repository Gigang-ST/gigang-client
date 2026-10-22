/** Placeholder content for the mockup. Swap for real numbers. */

import { LINE_FRAMES } from "@/lib/intro/media";

/**
 * One frame per line of the hero sequence.
 *
 * The photograph itself comes from public/lines/, named after its line — swap
 * the file to swap the picture. Every line stands at the top of the screen;
 * what lives here is `tone`, which colour of type survives on that frame —
 * "light" frames take black type, "dark" frames take white — and `focus`,
 * where the portrait crop holds.
 */
export type CrewFrameSpec = {
  src: string | null;
  tone: "light" | "dark";
  /** Which part of the photograph the crop keeps. */
  focus?: string;
};

export const crewFrames: CrewFrameSpec[] = [
  {
    src: LINE_FRAMES[0],
    tone: "light",
  }, // NO GIVE UP
  {
    src: LINE_FRAMES[1],
    tone: "dark",
  }, // NO PAIN NO GAIN
  {
    src: LINE_FRAMES[2],
    tone: "dark",
    // He walks up the right-hand side of the tunnel.
    focus: "64% 50%",
  }, // NO EXCUSES
  { src: LINE_FRAMES[3], tone: "light" }, // NO SHORTCUTS
  {
    src: LINE_FRAMES[4],
    tone: "light",
    // The pair run right of centre; the crop follows them.
    focus: "64% 50%",
  }, // NO ONE RUNS ALONE
  { src: null, tone: "light" }, // NO TIME TO BE WEAK — bare paper
];

/** The one destination this page has. */
export const JOIN_URL = "/";
