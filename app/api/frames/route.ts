import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The burst reads the folder rather than a hard-coded count, so frames can be
 * added or deleted in public/crew/frames/ without renumbering anything or
 * touching code. Names only need to sort in the order they should play.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const dir = path.join(process.cwd(), "public", "crew", "frames");

  try {
    const files = await readdir(dir);
    const frames = files
      .filter((f) => /\.(webp|jpg|jpeg|png|avif)$/i.test(f))
      .sort()
      .map((f) => `/crew/frames/${f}`);

    return Response.json({ frames });
  } catch {
    return Response.json({ frames: [] });
  }
}
