/**
 * 인트로 사진을 웹에 실을 크기로 줄인다(제자리 덮어쓰기).
 *
 *   pnpm intro:compress          # 기준을 넘는 파일만 줄인다
 *   pnpm intro:compress --check  # 줄이지 않고 넘는 파일만 알린다
 *
 * 줄이는 건 긴 변이 기준을 넘거나 webp가 아닌 파일뿐이다 — webp를 다시 webp로 굽는 건
 * 손실이 쌓여서, 새로 넣은(큰) 파일만 한 번 줄이게 한다. 장당 용량은 경고만 한다. 원본 화질이 필요하면 원본은 저장소 밖에 둔다
 * (public/lines/README.md).
 *
 * 받는 형식은 webp·jpg·jpeg·png·avif 이고, 결과는 늘 같은 이름의 .webp 다
 * (jpg를 넣으면 jpg를 지우고 webp를 남긴다).
 */
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const RULES = [
  // 문장 배경 — 화면 전체를 덮는 한 장. 1920 모니터·레티나 노트북까지.
  { dir: "public/lines", maxEdge: 2400, quality: 75, budget: 400 * 1024 },
  // 버스트 — 0.17초씩 스쳐 가는 프레임. 장 수가 많아 한 장을 작게.
  { dir: "public/crew/frames", maxEdge: 1080, quality: 70, budget: 150 * 1024 },
];
const IMAGE = /\.(webp|jpe?g|png|avif)$/i;
const checkOnly = process.argv.includes("--check");

let over = 0;
for (const rule of RULES) {
  const dir = path.join(root, rule.dir);
  const files = (await readdir(dir)).filter((f) => IMAGE.test(f)).sort();
  let before = 0;
  let after = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    const input = await readFile(full);
    const meta = await sharp(input).metadata();
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const isWebp = file.toLowerCase().endsWith(".webp");
    before += input.length;

    // 용량(budget)은 경고만 한다 — 크기·형식을 이미 맞춘 파일을 용량 때문에 다시 구우면
    // 돌릴 때마다 손실이 쌓인다. 넘으면 사진을 바꾸거나 품질을 직접 낮춘다.
    const needs = edge > rule.maxEdge || !isWebp;
    if (!needs && input.length > rule.budget) {
      console.log(`경고  ${rule.dir}/${file}  ${kb(input.length)} — 기준 ${kb(rule.budget)}보다 큼`);
    }
    if (!needs) {
      after += input.length;
      continue;
    }
    if (checkOnly) {
      over += 1;
      console.log(`넘음  ${rule.dir}/${file}  ${edge}px ${kb(input.length)}`);
      after += input.length;
      continue;
    }

    const output = await sharp(input)
      .rotate()
      .resize({
        width: rule.maxEdge,
        height: rule.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: rule.quality, effort: 6 })
      .toBuffer();

    const target = path.join(dir, file.replace(IMAGE, ".webp"));
    await writeFile(target, output);
    if (target !== full) await rm(full);
    after += output.length;
    const note = output.length > rule.budget ? "  ⚠️ 기준보다 큼" : "";
    console.log(
      `줄임  ${rule.dir}/${file}  ${edge}px ${kb(input.length)} → ${kb(output.length)}${note}`,
    );
  }

  console.log(`${rule.dir}: ${files.length}장 ${kb(before)} → ${kb(after)}`);
}

if (checkOnly && over > 0) process.exit(1);

function kb(n) {
  return `${Math.round(n / 1024)}KB`;
}
