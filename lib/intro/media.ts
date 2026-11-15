/**
 * Media the intro shows, and the order the splash fetches it in.
 *
 * Every photo URL carries `?v=<content hash>` (scripts/gen-intro-media.mjs, run
 * at install/dev/build). /crew and /lines are served immutable for a year so the
 * burst never revalidates mid-run; the hash is what lets a file be overwritten
 * under the same name and still reach returning visitors.
 */
import { BURST_FRAMES, LINE_MEDIA } from "@/lib/intro/media.generated";

export { BURST_FRAMES };

/**
 * One photograph per line of the hero sequence, named after the line it sits
 * behind. To change a background, overwrite the file — no code changes.
 * See public/lines/README.md.
 */
export const LINE_FILES = [
  "/lines/01-no-give-up.webp",
  "/lines/02-no-pain-no-gain.webp",
  "/lines/03-no-excuses.webp",
  "/lines/04-no-shortcuts.webp",
  "/lines/05-no-one-runs-alone.webp",
  // NO TIME TO BE WEAK has no photograph: the last line stands on paper.
] as const;

/** LINE_FILES with their content versions. A file missing from the folder
 *  falls back to the bare path (a test keeps the two lists in step). */
export const LINE_FRAMES: string[] = LINE_FILES.map((f) => LINE_MEDIA[f] ?? f);

export const LOGO_MARK = "/logo-mark.png";

/** How many burst frames the splash waits for. At 170ms a frame this is about
 *  a second of run; the rest load during the ~12s of lines before the burst. */
export const BURST_HEAD = 6;

/**
 * What the splash holds the door for, and what it fetches behind the show.
 *
 * Critical: every line background (they appear 0.26s after the door opens,
 * 2s apart), the mark, the opening of the burst, and its last frame — the run
 * lands there, and with reduced motion it is the only frame shown.
 * Deferred: the rest of the burst, in play order.
 */
export function planIntroMedia(
  burst: readonly string[],
  head = BURST_HEAD,
): { critical: string[]; deferred: string[] } {
  const last = burst.at(-1);
  const critical = [...LINE_FRAMES, LOGO_MARK, ...burst.slice(0, head)];
  if (last && !critical.includes(last)) critical.push(last);
  const deferred = burst.filter((src) => !critical.includes(src));
  return { critical, deferred };
}

/**
 * The next burst frame to show after `from`: the nearest later frame already
 * fetched. A frame still on the wire is skipped rather than waited for — a
 * blank 170ms reads as a stutter, a missing one does not. Returns -1 when the
 * run is over. The last frame is critical, so a run always lands on it.
 */
export function nextReadyFrame(
  frames: readonly string[],
  from: number,
  ready: ReadonlySet<string>,
): number {
  for (let j = from + 1; j < frames.length; j += 1) {
    if (j === frames.length - 1 || ready.has(frames[j])) return j;
  }
  return -1;
}
