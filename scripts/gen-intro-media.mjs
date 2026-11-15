/**
 * 인트로 사진 목록·버전을 빌드 때 만든다 → lib/intro/media.generated.ts (gitignore).
 *
 * 왜 빌드 때인가: 예전엔 /api/frames 가 요청마다 public/crew/frames 를 fs 로 읽었는데,
 * Vercel 서버 함수 번들엔 public/ 이 들어가지 않아 운영에선 빈 목록이 될 수 있었다.
 * 지금은 빌드가 폴더를 읽어 목록을 코드에 박는다 — 폴더에 넣고 빼기만 하면 다음 빌드에 반영된다.
 *
 * 왜 ?v=<내용 해시>인가: /crew·/lines 는 1년 immutable 캐시다(버스트 깜빡임 방지 —
 * next.config.ts). 같은 이름으로 덮어써도 내용이 바뀌면 해시가 바뀌어 주소가 바뀌므로
 * 재방문자도 새 사진을 받는다. 파일 이름은 그대로라 "덮어쓰면 바뀐다"가 성립한다.
 *
 * 돌리는 때: postinstall · predev · prebuild (package.json). 손으로는 `pnpm intro:media`.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const IMAGE = /\.(webp|jpe?g|png|avif)$/i;
const OUT = path.join(root, "lib", "intro", "media.generated.ts");

/** public 아래 폴더 → { 원래 주소: 버전 붙은 주소 }. 이름 순 = 재생 순. */
async function versionDir(rel) {
  const dir = path.join(root, "public", rel);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => IMAGE.test(f)).sort();
  } catch {
    console.warn(`[intro:media] ${rel} 폴더가 없다 — 빈 목록으로 만든다`);
  }
  const entries = [];
  for (const file of files) {
    const body = await readFile(path.join(dir, file));
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
    const url = `/${rel}/${file}`;
    entries.push([url, `${url}?v=${hash}`]);
  }
  return entries;
}

const lines = await versionDir("lines");
const frames = await versionDir("crew/frames");

const source = `// 자동 생성 — scripts/gen-intro-media.mjs (postinstall·predev·prebuild). 손으로 고치지 않는다.

/** public/lines 의 파일 → 내용 해시가 붙은 주소. */
export const LINE_MEDIA: Readonly<Record<string, string>> = ${JSON.stringify(
  Object.fromEntries(lines),
  null,
  2,
)};

/** public/crew/frames 의 버스트 프레임, 재생 순(이름 순). */
export const BURST_FRAMES: readonly string[] = ${JSON.stringify(
  frames.map(([, v]) => v),
  null,
  2,
)};
`;

await mkdir(path.dirname(OUT), { recursive: true });
let previous = "";
try {
  previous = await readFile(OUT, "utf8");
} catch {}
if (previous !== source) await writeFile(OUT, source);
console.log(
  `[intro:media] 문장 배경 ${lines.length}장 · 버스트 ${frames.length}장 → lib/intro/media.generated.ts`,
);
