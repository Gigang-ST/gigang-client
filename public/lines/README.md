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
(`lib/intro/data.ts`에서 `src: null`).

## 바꾸는 법

**같은 이름으로 덮어쓰면 된다.** 이 폴더는 1년 immutable 캐시지만(`next.config.ts` —
프레임마다 재검증이 돌면 연출이 깜빡여서), 페이지는 파일을 늘 `?v=<내용 해시>`를 붙여
부른다. 해시는 빌드 때 `scripts/gen-intro-media.mjs`가 붙이므로(postinstall·dev·build 때
자동), 내용이 바뀌면 주소가 바뀌어 재방문자도 새 사진을 받는다. 로컬에서 바로 보려면
`pnpm intro:media`. 이름이나 확장자를 바꿨다면 `lib/intro/media.ts`의 `LINE_FILES`도 고친다
(테스트가 어긋남을 잡는다).

버스트 사진(`public/crew/frames/`)은 목록도 빌드가 만든다 — 폴더에 넣고 빼기만 하면
다음 빌드에 반영된다. 재생 순서는 파일 이름 순이다.

### 넣기 전에 줄인다

넣은 뒤 한 번 돌린다(이 프로젝트에 이미 있는 sharp를 쓴다):

```
pnpm intro:compress          # 기준을 넘는 파일만 webp로 줄인다(제자리)
pnpm intro:compress --check  # 줄이지 않고 확인만
```

| 폴더 | 긴 변 | webp 품질 | 장당 목표 |
|---|---|---|---|
| `public/lines` | 2400px | 75 | 400KB 이하 |
| `public/crew/frames` | 1080px | 70 | 150KB 안팎 (합계 3MB 이하) |

이미 기준을 지킨 webp는 다시 굽지 않는다(손실이 쌓여서). **원본 화질을 남겨야 하면
원본은 저장소 밖(드라이브 등)에 두고**, 여기엔 줄인 것만 넣는다 — 저장소에 원본을 넣으면
클론·배포마다 그 무게를 진다.

### 첫 화면이 기다리는 것

스플래시는 문장 배경 5장·로고·버스트 앞 6장·버스트 마지막 장만 받고 열린다
(`planIntroMedia`). 나머지 버스트는 문장이 흐르는 약 12초 동안 뒤에서 받고, 차례가 왔는데
아직 못 받은 장은 건너뛴다. 그래서 버스트 사진을 늘려도 첫 화면은 느려지지 않지만,
문장 배경을 무겁게 넣으면 그만큼 첫 화면이 늦어진다.

## 사진 고를 때

- **가로로 긴 컷**이 맞는다. 세로 사진은 위아래가 잘린다.
- 인물이 **화면 한가운데** 오면 문장에 덮인다. 좌우나 위아래로 치우친 컷이 낫다.
- **색 보정은 파일에서 끝낸다.** 페이지는 어떤 필터도 걸지 않는다 —
  흑백으로 넣으면 흑백으로, 일부만 컬러로 남긴 보정본이면 그대로 나온다.
- 밝기는 `lib/intro/data.ts`의 `tone`으로 맞춘다: 어두운 사진이면 `"dark"`
  (흰 글자), 밝은 사진이면 `"light"` (검정 글자).
- 인물이 한쪽으로 치우쳤으면 같은 파일의 `focus`로 크롭 창을 옮긴다
  (`"64% 50%"` 처럼).
- 글자 위치도 같은 파일의 `place`로 옮긴다: `TOP_LEFT` / `BOTTOM_LEFT`.

## 문장을 더하거나 뺄 때

문장 목록은 `components/intro/hero.tsx`의 `TAILS`에 있다. 거기서 빼면
`lib/intro/media.ts`의 `LINE_FILES`와 `lib/intro/data.ts`의 `crewFrames`에서도
같은 줄을 빼고, 이 폴더의 파일 번호를 앞당긴다 — 셋의 순서가 곧 매핑이다.
