/**
 * before/ 와 after/ 스크린샷을 비교하여 diff/ 이미지를 생성
 *
 * 사용법: pnpm run screenshots:diff
 *
 * 변경된 픽셀은 빨간색으로 하이라이트됩니다.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const SCREENSHOTS_DIR = "screenshots";
const BEFORE_DIR = path.join(SCREENSHOTS_DIR, "before");
const AFTER_DIR = path.join(SCREENSHOTS_DIR, "after");
const DIFF_DIR = path.join(SCREENSHOTS_DIR, "diff");

function readPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

function main() {
  if (!fs.existsSync(BEFORE_DIR) || !fs.existsSync(AFTER_DIR)) {
    console.error("❌ before/ 또는 after/ 폴더가 없습니다.");
    console.error("   먼저 screenshots:before 와 screenshots:after 를 실행하세요.");
    process.exit(1);
  }

  fs.mkdirSync(DIFF_DIR, { recursive: true });

  const beforeFiles = fs.readdirSync(BEFORE_DIR).filter((f) => f.endsWith(".png"));

  if (beforeFiles.length === 0) {
    console.error("❌ before/ 에 PNG 파일이 없습니다.");
    process.exit(1);
  }

  console.log("\n🔍 스크린샷 비교 시작\n");
  console.log("  페이지              변경 픽셀      결과");
  console.log("  ─────────────────────────────────────────");

  let totalChanged = 0;

  for (const file of beforeFiles) {
    const beforePath = path.join(BEFORE_DIR, file);
    const afterPath = path.join(AFTER_DIR, file);
    const diffPath = path.join(DIFF_DIR, file);
    const name = file.replace(".png", "").padEnd(18);

    if (!fs.existsSync(afterPath)) {
      console.log(`  ${name} —                  ⚠️  after 없음`);
      continue;
    }

    const before = readPng(beforePath);
    const after = readPng(afterPath);

    // 크기가 다르면 큰 쪽에 맞추기
    const width = Math.max(before.width, after.width);
    const height = Math.max(before.height, after.height);

    const resizedBefore = resizeCanvas(before, width, height);
    const resizedAfter = resizeCanvas(after, width, height);

    const diff = new PNG({ width, height });

    const mismatchedPixels = pixelmatch(
      resizedBefore.data,
      resizedAfter.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 }
    );

    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    const totalPixels = width * height;
    const changePercent = ((mismatchedPixels / totalPixels) * 100).toFixed(2);

    if (mismatchedPixels === 0) {
      console.log(`  ${name} 0               ✅ 동일`);
    } else {
      console.log(
        `  ${name} ${mismatchedPixels.toLocaleString().padStart(10)}  (${changePercent}%)  🔴 변경됨`
      );
      totalChanged++;
    }
  }

  console.log("  ─────────────────────────────────────────");
  console.log(
    `\n📊 결과: ${beforeFiles.length}개 페이지 중 ${totalChanged}개 변경됨`
  );
  console.log(`📁 diff 이미지: ${DIFF_DIR}/\n`);
}

function resizeCanvas(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) return img;
  const resized = new PNG({ width, height, fill: true });
  // 흰색 배경으로 채우기
  for (let i = 0; i < resized.data.length; i += 4) {
    resized.data[i] = 255;
    resized.data[i + 1] = 255;
    resized.data[i + 2] = 255;
    resized.data[i + 3] = 255;
  }
  PNG.bitblt(img, resized, 0, 0, img.width, img.height, 0, 0);
  return resized;
}

main();
