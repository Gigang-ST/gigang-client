# OG 이미지 전용 폰트 서브셋

`app/api/og/gathering/route.tsx`(`next/og` `ImageResponse`)가 읽는다. **앱 화면은 이 폴더를 쓰지 않는다** —
화면은 `../pretendard/PretendardVariable.woff2`(next/font)와 Google Fonts Oswald를 쓴다.

따로 두는 이유: Satori는 **woff2를 못 읽고**(ttf/otf/woff만) variable 축도 못 탄다. 전체 OTF는 무게당
1.5MB라 요청마다 파싱하기엔 무거워, 실제로 쓰는 범위만 잘랐다.

| 파일 | 원본 | 범위 | 크기 |
|---|---|---|---|
| `pretendard-bold.subset.otf` (700) | Pretendard v1.3.9 `Pretendard-Bold.otf` | KS X 1001 한글 2,350자 + ASCII + Latin-1 + 문장부호·기호·CJK 괄호·호환 자모·전각 | ~410KB |
| `pretendard-extrabold.subset.otf` (800) | 〃 `Pretendard-ExtraBold.otf` | 〃 | ~410KB |
| `oswald-500.subset.ttf` | Google Fonts `Oswald[wght].ttf` → wght=500 정적 인스턴스 | ASCII + Latin-1 | 23KB |
| `oswald-700.subset.ttf` | 〃 wght=700 | 〃 | 23KB |

- **KS X 1001 밖의 한글**(뷁·똠 같은 확장 음절)·한자는 글리프가 없어 빈 네모로 찍힌다. 모임 제목에
  그런 글자가 실제로 쓰이면 범위를 넓혀 다시 생성한다(11,172자 전체면 무게당 ~1.2MB).
- 이모지는 Satori가 twemoji를 CDN에서 가져와 그린다(폰트와 무관).
- 라이선스: Pretendard·Oswald 모두 SIL OFL 1.1.

## 다시 만들기

`uv`로 fonttools를 일회성 실행한다(스크립트는 PEP 723 인라인 메타데이터):

```
uv run --no-project --with "fonttools>=4.50" --with brotli scripts/subset-og-fonts.py app/fonts/og
```
