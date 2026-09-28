# 문장별 배경 사진

히어로에 흐르는 `NO ...` 문장 하나에 사진 한 장. 파일 이름이 문장이다.

```
01-no-give-up.webp
02-no-pain-no-gain.webp
03-no-excuses.webp
04-no-shortcuts.webp
05-no-one-runs-alone.webp
```

마지막 줄 `NO TIME TO BE WEAK`은 사진 없이 흰 지면으로 간다
(`src/lib/data.ts`에서 `src: null`).

## 바꾸는 법

같은 이름으로 덮어쓰면 끝이다. 코드는 건드리지 않는다.
`.webp`가 아니어도 되지만, 확장자를 바꿨다면 `src/lib/media.ts`의
`LINE_FRAMES` 경로도 같이 고쳐야 한다.

원본이 크면 미리 줄여서 넣는 편이 낫다 (가로 1600px, 품질 70 정도):

```
cwebp -q 70 -resize 1600 0 원본.jpg -o 01-no-give-up.webp
```

## 사진 고를 때

- **가로로 긴 컷**이 맞는다. 세로 사진은 위아래가 잘린다.
- 인물이 **화면 한가운데** 오면 문장에 덮인다. 좌우나 위아래로 치우친 컷이 낫다.
- **색 보정은 파일에서 끝낸다.** 페이지는 어떤 필터도 걸지 않는다 —
  흑백으로 넣으면 흑백으로, 일부만 컬러로 남긴 보정본이면 그대로 나온다.
- 밝기는 `src/lib/data.ts`의 `tone`으로 맞춘다: 어두운 사진이면 `"dark"`
  (흰 글자), 밝은 사진이면 `"light"` (검정 글자).
- 인물이 한쪽으로 치우쳤으면 같은 파일의 `focus`로 크롭 창을 옮긴다
  (`"64% 50%"` 처럼).
- 글자 위치도 같은 파일의 `place`로 옮긴다: `TOP_LEFT` / `BOTTOM_LEFT`.

## 문장을 더하거나 뺄 때

문장 목록은 `src/components/hero.tsx`의 `TAILS`에 있다. 거기서 빼면
`src/lib/media.ts`의 `LINE_FRAMES`와 `src/lib/data.ts`의 `crewFrames`에서도
같은 줄을 빼고, 이 폴더의 파일 번호를 앞당긴다 — 셋의 순서가 곧 매핑이다.
