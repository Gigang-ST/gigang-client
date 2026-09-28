/** Media the page shows. The splash fetches all of it before opening. */

/**
 * One photograph per line of the hero sequence, named after the line it sits
 * behind. To change a background, overwrite the file — no code changes.
 * See public/lines/README.md.
 */
export const LINE_FRAMES = [
  "/lines/01-no-give-up.webp",
  "/lines/02-no-pain-no-gain.webp",
  "/lines/03-no-excuses.webp",
  "/lines/04-no-shortcuts.webp",
  "/lines/05-no-one-runs-alone.webp",
  // NO TIME TO BE WEAK has no photograph: the last line stands on paper.
] as const;

/** Everything the page needs that is known without reading the disk. */
export const STATIC_MEDIA = [...LINE_FRAMES, "/logo-mark.png"];

/** The burst frames live in public/crew/frames and are listed by the server,
 *  so deleting a file is all it takes to drop it from the run. */
export async function fetchBurstFrames(): Promise<string[]> {
  try {
    const res = await fetch("/api/frames", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { frames?: string[] };
    return data.frames ?? [];
  } catch {
    return [];
  }
}
