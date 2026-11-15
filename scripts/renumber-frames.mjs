/**
 * Close the gaps in public/crew/frames after deleting frames.
 *
 * The build lists the folder (scripts/gen-intro-media.mjs), so gaps are
 * harmless — this is only for keeping the names tidy once the pruning is done.
 * Play order is the current numeric order, so the run still ends on whatever
 * is last now. Renumbering is safe for returning visitors: every URL carries a
 * content hash, so a name handed to a different photograph is a new URL.
 *
 *   pnpm frames:renumber
 */
import { readdir, rename, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "crew", "frames");
const staging = path.join(process.cwd(), "public", "crew", "_renumber");

const files = (await readdir(dir))
  .filter((f) => f.toLowerCase().endsWith(".webp"))
  .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

if (files.length === 0) {
  console.log("no frames found");
  process.exit(0);
}

const width = Math.max(2, String(files.length).length);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

for (const [i, file] of files.entries()) {
  const next = `${String(i + 1).padStart(width, "0")}.webp`;
  await rename(path.join(dir, file), path.join(staging, next));
}

// dir 자체는 지우지 않는다 — .webp만 옮겼으니 다른 확장자 파일이 남아 있을 수 있다.
for (const file of await readdir(staging)) {
  await rename(path.join(staging, file), path.join(dir, file));
}
await rm(staging, { recursive: true, force: true });

console.log(
  `renumbered ${files.length} frames: 01..${String(files.length).padStart(width, "0")} (last frame unchanged)`,
);
