# 기강 디자인 시스템

## 색상 토큰

### 기본 (Base)

| 토큰 | Tailwind 클래스 | 용도 |
|------|----------------|------|
| `--background` | `bg-background` | 페이지 배경 (흰색) |
| `--foreground` | `text-foreground` | 기본 텍스트 (거의 검정) |
| `--primary` | `bg-primary`, `text-primary` | 주요 액션, 링크 (파란색) |
| `--secondary` | `bg-secondary` | 보조 배경, 아바타 폴백 배경 |
| `--muted` | `bg-muted` | 비활성 배경 |
| `--muted-foreground` | `text-muted-foreground` | 보조 텍스트, 라벨 |
| `--destructive` | `bg-destructive` | 삭제, 오류 (빨간색) |
| `--border` | `border-border` | 테두리, 구분선 |

### 상태 (Status)

| 토큰 | 용도 |
|------|------|
| `--success` | 완주, 성공 (초록) |
| `--warning` | 진행중, 주의 (주황) |
| `--info` | 예정, 안내 (파란) |
| `--destructive` | DNF, 오류 (빨강) |

### 전광판 스크린 존 (Board) — 프로필 카드 + 팀 펄스 밴드

| 토큰 | Tailwind 클래스 | 용도 |
|------|----------------|------|
| `--board` | `bg-board` | 전광판 유리 배경 (스크린 존) |
| `--board-foreground` | `text-board-foreground` | 스크린 존 텍스트 |
| `--board-muted` | `text-board-muted` | 스크린 존 보조 텍스트 |
| `--board-line` | `border-board-line` | 도트리더·구분선 |
| `--board-amber` | `text-board-amber` | LED 앰버 — LIVE·NEW·등번호·D-day |
| `--pulse-neon` | `text-pulse-neon` | 심전도 형광 청록 — 팀 펄스 파형·BPM |

**라이트/다크 공통값**(`.dark`에서 재정의하지 않음). 이 존만 항상 야간으로 남겨,
glow 기반 프레임 22종·칭호 이펙트 48종이 두 테마 모두에서 발광하게 하는 무대다.

**어두운 판이 필요한 건 glow를 쓰기 때문이다** — 발광 효과는 밝은 배경에서 빛나지 않고 뿌옇게
번지기만 한다. 그래서 이 존을 쓰는 곳은 둘이다: 프로필 카드 상단(프레임·칭호 이펙트)과
기강이야기 팀 펄스 밴드(`--pulse-neon` 심전도). **glow가 없는 요소를 어둡게 만들려고
board를 가져다 쓰지 않는다** — 그건 그냥 검은 상자이고, 흰 지면에서 광고 배너로 읽힌다.

- `--board-amber`는 **스크린 존 밖에서 쓰지 않는다**(팀 펄스 밴드에서도 안 쓴다 — 청록만).
- `--pulse-neon`은 **반드시 `bg-board` 위에** 올린다. 흰 지면에 얹으면 glow가 죽는다.

### 종목 (Sport)

| 토큰 | Tailwind 클래스 | 종목 |
|------|----------------|------|
| `--sport-road-run` | `bg-sport-road-run` | 로드 러닝 |
| `--sport-ultra` | `bg-sport-ultra` | 울트라마라톤 |
| `--sport-trail-run` | `bg-sport-trail-run` | 트레일 러닝 |
| `--sport-triathlon` | `bg-sport-triathlon` | 철인3종 |
| `--sport-cycling` | `bg-sport-cycling` | 사이클 |

`chart-1~5`는 `sport-*` 참조 (하위호환).

---

## 타이포그래피

`components/common/typography.tsx`에 시맨틱 컴포넌트로 정의. **`text-[28px]` 등 매직넘버 대신 반드시 타이포그래피 컴포넌트 사용.**

```tsx
import { H1, H2, Body, Caption, Micro, SectionLabel } from "@/components/common/typography";
```

| 컴포넌트 | HTML 태그 | 사이즈 | 기본 스타일 | 용도 |
|----------|-----------|--------|------------|------|
| `<H1>` | `h1` | 28px bold | text-foreground | 메인 탭 페이지 제목 |
| `<H2>` | `h2` | 22px bold | text-foreground | 서브 페이지 제목 |
| `<Body>` | `span` | 15px | text-foreground | 리스트 이름, 본문 |
| `<Caption>` | `span` | 13px | text-muted-foreground | 서브 정보, 필터 |
| `<Micro>` | `span` | 11px | text-muted-foreground | 배지, 날짜 세부 |
| `<SectionLabel>` | `span` | 12px semibold tracking-widest | text-muted-foreground | 영문 섹션 라벨 |

모든 타이포그래피 컴포넌트는 `className` prop으로 스타일 오버라이드 가능:

```tsx
<Body className="font-semibold">홍길동</Body>
<Caption className="text-foreground">강조된 캡션</Caption>
```

---

## 간격 & 레이아웃

| 항목 | 값 | 비고 |
|------|-----|------|
| 페이지 좌우 패딩 | `px-6` | 모든 페이지 공통 |
| 섹션 간 간격 | `gap-7` | 메인 페이지 콘텐츠 |
| 섹션 내부 간격 | `gap-4` | 섹션 헤더 ~ 콘텐츠 |
| 카드 내부 패딩 | `p-4` | CardItem 기본 |
| 카드 반지름 | `rounded-2xl` (24px) | CardItem, Skeleton |
| 버튼/입력 반지름 | `rounded-md` (6px) | Button, Input |
| 그리드 간격 | `gap-3` | 카드 그리드 |

---

## 앱 네비게이션

### 하단 탭바 (5탭)

| 순서 | 탭 | 아이콘 | 경로 |
|------|-----|--------|------|
| 1 | 홈 | House | `/` |
| 2 | 대회 | Trophy | `/races` |
| 3 | 프로젝트 | Zap | `/projects` |
| 4 | 랭킹 | Medal | `/records` |
| 5 | 프로필 | User | `/profile` |

### Route Group

| 그룹 | 레이아웃 | 용도 |
|------|---------|------|
| `(main)` | 하단 탭바 (`BottomTabBar`) | 메인 탭 페이지 |
| `(info)` | 뒤로가기 헤더 (`BackHeader`) | 설정, 관리, 프로필 편집 |
| `(protected)` | 인증 필수 | 온보딩 |

---

## 컴포넌트 카탈로그

### shadcn/ui 기본 (`components/ui/`)

`pnpm dlx shadcn@latest add [name]`으로 추가. 이 폴더에는 shadcn 공식 컴포넌트만 배치.

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| Button | `button.tsx` | 액션 버튼 (6 variant × 8 size) |
| Card / CardItem | `card.tsx` | 카드 레이아웃. **CardItem** = 프로젝트 공통 (outlined/dashed) |
| Badge | `badge.tsx` | 상태 배지 |
| Input | `input.tsx` | 텍스트 입력 |
| Label | `label.tsx` | 폼 라벨 |
| Dialog | `dialog.tsx` | 모달 다이얼로그 |
| Form | `form.tsx` | React Hook Form 통합 |
| Select | `select.tsx` | 드롭다운 선택 |
| Separator | `separator.tsx` | 구분선 |
| Skeleton | `skeleton.tsx` | 로딩 스켈레톤 |
| LoadingSpinner | `loading-spinner.tsx` | 스피너 |

### 프로젝트 공통 (`components/common/`)

| 컴포넌트 | 파일 | Props | 용도 |
|----------|------|-------|------|
| H1, H2, Body, Caption, Micro, SectionLabel | `typography.tsx` | `children`, `className?` | 타이포그래피 |
| PageHeader | `page-header.tsx` | `title`, `action?` | 메인 페이지 상단 h-14 헤더 |
| SectionHeader | `section-header.tsx` | `label`, `action?` | 섹션 라벨 + "모두 보기" 링크 |
| EmptyState | `empty-state.tsx` | `message`, `icon?`, `variant?` | 빈 목록 ("card" / "inline") |
| SegmentControl | `segment-control.tsx` | `segments`, `value`, `onValueChange` | 탭 전환 UI |
| InfoRow | `info-row.tsx` | `label`, `value?` | label-value 쌍 행 |
| Avatar | `avatar.tsx` | `src?`, `size?`, `fallbackIcon?` | 프로필 사진 + 폴백 아이콘 |
| StatCard | `stat-card.tsx` | `value`, `label`, `valueClassName?` | 통계 수치 카드 |
| HelpTip | `help-tip.tsx` | `title`, `children`, `align?` | 원형 물음표 + 팝오버 설명 |

**사진 미리보기는 확인용이지 감상용이 아니다**(`PhotoPicker`의 `size`): 폼 폭을 꽉 채운 정사각은
375px에서 ~343px이라 사진 하나가 폼을 다 먹고 나머지 입력이 스크롤 밖으로 밀린다. "무엇을 골랐는지"만
보이면 되는 자리(깅스타그램 작성·다건 마일리지런)는 `size="half"`로 면적을 1/4로 줄인다. 사진이 그
폼의 주인공일 때만 `full`을 쓴다. **폭은 컴포넌트 래퍼가 잡는다** — 바깥 `<div className="w-1/2">`로
감싸면 지우기 버튼(`absolute right-2`)이 줄어든 사진에서 떨어져 허공에 남는다.

**HelpTip은 앱 전역 공통 패턴이다.** 설명이 필요한 지표·규칙 옆에 붙여 "이게 뭔가"를 그 자리에서 답한다
(게임 UI의 물음표 버튼과 같은 역할). 새 기능에 설명이 필요하면 별도 툴팁을 만들지 말고 이걸 쓴다.
아이콘은 14px이지만 히트 영역은 32px — 손가락으로 눌러야 하므로.

### 멤버 프로필 카드 (`components/members/`)

| 컴포넌트 | 파일 | Props | 용도 |
|----------|------|-------|------|
| MemberCardCompact | `member-card.tsx` | `memId`, `data`, `meta?`, `onSelect?` | 간단 카드 — "이 사람이 누구인지". 한마디 + 러닝 프로필 한 줄. `meta`는 우측 슬롯(가입일 등), `onSelect`를 주면 카드 전체가 버튼 |
| MemberCardDetail | `member-card-detail.tsx` | `memId`, `data`, `onEditIntro?`, `locked?`, `edit?` | 소개판 본체 — **한 컴포넌트가 두 판을 그린다**(§아래). `edit`이 있으면 편집판(프로필탭), 없으면 공개판(팝업) |
| MemberCardDialog | `member-card-dialog.tsx` | `memId`, `memNm?`, `teamId`, `open`, `onOpenChange`, `stacked?`, `isOwner?` | 오픈 시 RPC 1회 + 스켈레톤·재시도·탈퇴 폴백. `stacked`로 다른 시트 위에 겹침 |
| IntroEditDialog | `intro-edit-dialog.tsx` | `open`, `onOpenChange`, `initialValue`, `onSaved?`, `stacked?` | 한마디 한 줄 인라인 편집(페이지 이동 없음) |
| ProfileTabCard | `profile/profile-tab-card.tsx` | `memId`, `teamMemId`, `teamId`, `card`, `utmb`, … | 프로필탭 본문 — `MemberCardDetail`에 `edit`을 물리고 편집 다이얼로그들을 연결 |

- **간단 vs 상세**: 간단 카드는 "이 사람이 누구인지"(한마디·러닝 프로필), 상세 카드는 "이 사람의 실적".
  실적이 없는 신규 멤버도 채워지도록 간단 카드에는 수치를 넣지 않는다.
- 데이터: `getPublicMemberCard()` (`lib/queries/member-card.ts`) — `null`이면 "함께 달렸던 멤버" 폴백.
  간단 카드는 `MemberCardCompactData`(좁힌 표면)만 요구해 피드 RPC payload로도 그릴 수 있다.
- 표시 규칙(컨디션 4단계·종목 라벨·NEW 판정·D-day·러닝 프로필·기록 칸·페이스 추이 판정)은
  `lib/member-card.ts` 한 곳. 회귀 테스트는 `lib/__tests__/member-card-sections.test.ts`와
  `components/members/__tests__/member-card-detail-render.test.ts`(두 판의 렌더 결과를 마크업으로 못박음).
- 모션: `.board-flicker` / `.board-cone` / `.board-rise*` (globals.css) — `prefers-reduced-motion` 존중.

#### 편집판 ↔ 공개판 — 같은 판, 다른 그릇

프로필탭과 카드 팝업은 **한 컴포넌트**(`MemberCardDetail`)를 공유한다. 따로 만들면 순서·서체·간격이
한쪽만 고쳐져 반드시 어긋나므로, `edit` prop의 유무로 갈린다.

| | 탭 (편집판, `edit` 있음) | 팝업 (공개판, `edit` 없음) |
|---|---|---|
| 그릇 | board 존을 `-mx-6`로 **전폭**, 아래는 지면에 직접 | `rounded-2xl` 카드 한 장 |
| 상단 고정·점등 | 안 붙음 / 플리커 끔 | `sticky` / `board-flicker` 켬 |
| 연필·빈 칸 | 있음 | **하나도 없음** (내 카드여도) |
| 포인트 | 있음 | **절대 없음** |

- **탭에서 board를 전폭으로 까는 건 필수다.** 흰 지면 중간에 떠 있는 검은 상자는 광고 배너로 읽히지만,
  지면을 가로지르는 띠는 끼워 넣은 계기 출력물로 읽힌다(§Board 토큰 · 팀 펄스 밴드와 같은 어법).
  팝업은 손에 쥐는 물건이라 카드가 맞다. 좌표도 그 판의 안쪽 패딩에 맞춘다 — 편집판 `left-6`(페이지
  px-6과 같은 자리라 아래 섹션과 세로줄이 맞는다), 공개판 `left-5`.
- **탭에서 sticky·플리커를 끄는 이유**: 팝업은 "카드를 여는 순간"이 있어 점등이 어울리지만, 탭은 매번
  들어오는 자리라 진입할 때마다 깜빡이면 피곤하고 고정하면 화면 3분의 1을 계속 먹는다.
- **팝업의 존재 이유는 "남들에게 보이는 내 카드"**다. 탭이 이미 같은 판이라 그냥 열면 중복이지만,
  공개 뷰라는 성격을 주면 미리보기가 된다. 진입은 탭의 얼굴·이름 탭.
  그래서 **팝업엔 편집 어포던스를 하나도 두지 않는다**(`MemberCardDialog`에 `isOwner`가 없는 이유).
  예전엔 본인일 때 한마디만 열어 뒀는데, 프로필탭이 전부 편집하게 되면서 그 예외가 사라졌다 —
  확인하는 자리에서 손을 대면 성격이 흐려지고 같은 값을 두 곳에서 고치게 된다.

#### 섹션 순서와 빈 상태 — 성격별 세 갈래

순서(양쪽 공통): **러닝 프로필 → 최근활동 → 다음 대회 → 개인 최고기록 → 페이스 추이 → 칭호**.
누구인가 → 요즘 어떤가 → 뭘 할 건가 → 실적은 → 어떻게 변해왔나 → 뭘 모았나.
기록 얘기 둘(최고기록·페이스 추이)이 붙어 함께 읽힌다.

| 성격 | 섹션 | 탭 | 팝업 |
|------|------|-----|------|
| **내가 적는 것** | 러닝 프로필 · 다음 대회 | 점선 칸(`EmptyState`)이 채우라고 말한다 | 아예 안 뜸 |
| **쌓이는 격자** | 최근활동 · 개인 최고기록 | 늘 표시(빈 값) | 늘 표시(같음) |
| **모이는 것** | 페이스 추이 · 칭호 | 없으면 섹션째 사라짐 | 같음 |

- *내가 적는 것*은 남에게 "이 사람 아무것도 안 썼다"를 보여줄 이유가 없다. *쌓이는 격자*는 칸이
  고정이라 **안 켜진 칸 자체가 정보**다(몇 개 남았는지 보인다). *모이는 것*은 0일 때 보여줄 형태가
  없다(점 없는 그래프, 배지 없는 배지 줄).
- **가입 목적은 러닝 프로필 안에 있다.** 같은 테이블(`mem_onbd_prf`)·같은 액션
  (`updateRunningProfile`)이라 섹션을 갈라 두면 연필이 둘인데 눌러 보면 같은 폼으로 간다.
  도트 리더 3행 아래 `가입 목적` 줄로 칩을 눕힌다. 라벨을 "목적"으로 줄이지 않는다 — 온보딩에서
  쓰는 말과 어긋나고 "무슨 목적?"이 된다.
- **일부만 비면 그 행에 `—`**(`getRunningProfileSlots`). 섹션이 통째로 비었을 때만 점선 칸.
  공개판은 여전히 채워진 행만 그린다(`getRunningProfileRows`) — **두 함수의 라벨 문구는 같아야 하므로
  한쪽을 고치면 반드시 다른 쪽도** 고친다.
- **기록 칸은 늘 같은 골격**(`buildPbRows`): `FULL / HALF / 10K` + 있는 종목(철인3종·사이클) + `UTMB INDEX`.
  없으면 `--:--`(UTMB는 `--`), 미연동 UTMB는 편집판에서 `연동하기` 버튼. `00:00:00`은 "0초에 완주"로
  읽힐 여지가 있어 쓰지 않는다. 철인3종·사이클은 **있을 때만** 붙인다 — 로드 러너 카드에 안 켜진
  철인 칸까지 세우면 "해야 할 일"처럼 보인다.
- **종목은 코드 표기**(`getRecordCodeLabel`): 바로 아래 페이스 차트 범례가 `10K HALF FULL`이라 같은 것을
  두 이름으로 부르면 안 된다. `getRecordLabel`(풀코스·하프)은 **기강이야기 리드 전용**으로 남긴다 —
  거긴 `종목 · 풀코스`처럼 한국어 문장 안이라 코드가 어색하다. 한쪽을 고쳐 다른 쪽이 끌려가지 않게
  함수를 둘로 둔다.
- **페이스 추이는 같은 종목 2건 이상일 때만**(`hasPaceTrend`). 점 하나짜리는 추이가 아니다.
  판정은 **전체 이력 기준**이고 기간 토글(최근 1년/전체)로 점이 줄어드는 건 차트 안에서 처리한다 —
  섹션이 토글마다 나타났다 사라지면 그게 더 이상하다.
- **칭호는 0개면 안 그린다** — 가입하면 뉴비가 자동으로 붙어 사실상 0이 없다. 대신 **대표 칭호를
  안 골랐으면 스크린 존에 점선 `?` 껍데기**가 자리를 지킨다(편집판만): 자리를 비워 두면 고를 수
  있다는 걸 영영 모른다. 껍데기든 배지든 **연필은 늘 붙는다**(→ 내 컬렉션). 하단 칭호 섹션엔
  연필을 달지 않는다 — 고르는 자리는 상단 하나.

#### 스크린 존 — 등번호와 응원 계기

- 좌상단 `NO.{back_no}`, 우상단 `🔥 {받은 응원}`. 같은 모노·앰버라 좌우 대칭 계기로 읽힌다.
- 위치는 **`right-11` 고정**(양쪽 공통) — 팝업 닫기 X(`right-3` + 폭 약 28px)를 비켜선 자리다.
  탭엔 X가 없어 여백만 조금 남지만, 두 판이 같은 좌표를 쓰는 편이 어긋날 여지가 없다.
- **0이어도 숨기지 않는다.** 대신 앰버 대신 `board-muted`로 낮춰 "아직 안 켜진 계기"로 보이게 한다.
- 집계는 `get_public_member_card`의 `rctn_recv_cnt` — **환영(newbie)·대박(actv/record/post)을 하나로
  합친 값**이다. 대회에 달리는 응원(`race`/cheer)은 뺀다: 그건 사람이 받은 게 아니라 대회에 달린 것이라
  같은 대회 출전자 전원이 같은 수치를 나눠 갖게 되어 개인 지표로 성립하지 않는다.
- **이모지는 `RCTN_LABEL`(문자열 리터럴)에서 가져온다.** JSX 본문에 직접 타이핑하면 Tailwind v4
  스캐너가 서로게이트 페어를 깨뜨려 빌드가 터진다(§KNOWLEDGE — 실제로 프로필 카드 구현에서 터진 적 있음).
- **한마디는 줄 전체가 버튼**(본인일 때). 연필만 히트 영역이면 12px 아이콘을 겨냥해야 한다.
  연필은 시각 힌트로만 남고, 빈 문구는 한 줄로 고정해 두 줄로 벌어지지 않게 한다.

#### 프로필탭에서만 보이는 것

- **활동 포인트**(`stats.activity_score`) — 최근활동 헤더 우측 primary pill + `HelpTip`
  ("모임 참석·대회 출전·기록 등록으로 쌓여요"). 적립 규칙 전문은 여전히 비공개.
  **남의 카드에는 절대 노출하지 않는다** — 공개되면 사실상 공개 랭킹 지표가 된다(렌더 테스트가 지킨다).
- **편집 진입점**: 한마디·칭호·기록 관리/추가·UTMB는 그 자리에서 다이얼로그로 열고,
  **러닝 프로필 + 가입 목적만 `/profile/edit#running-profile`로 보낸다.** 역 콤보박스·페이스 셀렉트·
  목적 칩을 다이얼로그로 다시 만들면 폼이 두 벌이 되어 한쪽만 고쳐 어긋난다.
- 프로필탭은 **서버에서** `getPublicMemberCard()`를 부른다. 클라이언트 조회로 옮기면 편집 액션들의
  `revalidatePath("/profile")`이 통째로 무력화된다.
- RPC는 `mem_st_cd = 'active'`만 돌려주므로 **비활성·탈퇴면 카드가 null**이다 — 빈 화면 대신
  "계정이 비활성 상태예요" 안내를 세운다.
- 내 정보·내 계좌·회비·건의 4버튼은 걷어냈다(설정에 전부 있다). **회비 미납 빨간 점**은 그 버튼이
  유일한 표면이었으므로 설정 화면 "회비 내역" 줄로 옮겼다(공지 안읽음 dot과 같은 규칙 — 햄버거
  아이콘엔 배지를 안 단다).

### 기강 전광판 (`components/story/`)

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| StoryClient | `story-client.tsx` | 전광판 본문 — 리드 + 오버뷰 + 존 3개 + 프로필 카드 진입 |
| StoryZoneHeader | `story-zone-header.tsx` | 존 헤더 — 괘선 + 영문 라벨 + 한국어 리드문(+우측 액션 슬롯). **모든 존 헤더의 간격·서체 정본** — 직접 `rule-section` 조합 금지 |
| StoryLede | `story-lede.tsx` | 1면 리드 — 종류당 한 칸(대회·새얼굴·기록·활동지수·목표 한마디·깅스타그램). 좌측 메인 + 우측 레일 |
| PersonProfile | `person-profile.tsx` | 프로필 부품 조합 — 아바타+이름 위에 `parts`(칭호·소개·개인최고기록·러닝프로필)를 순서대로 쌓는다. 리드 활동지수·목표 한마디 슬롯이 쓴다 |
| StoryPulse | `story-pulse.tsx` | 기강 오버뷰 — 전폭 심전도 밴드(파형 + BPM + 한 단어) + 이번 달 근거 한 줄 |
| HeartRate | `heart-rate.tsx` | 팀 심박수 파형 — 활동 지수 4단계를 심전도(ECG) + BPM으로. 활발할수록 빠르게 뛴다. `beats`로 박자 수 |
| StoryReactionButton | `story-reaction-button.tsx` | 응원 카운트업 — 누른 만큼 오른다(취소 없음, 무한 누적·표시만 9999에서 감김) |
| ActvHistorySheet | `actv-history-sheet.tsx` | 활동량 내역 바텀시트 — 이번 달 획득 내역 날짜 역순 + 합계 |
| PledgeSigns | `pledge-signs.tsx` | 목표 한마디 팻말 — 코스변 손팻말, 가로 스크롤. 만료 없이 쌓인다(1인 1개) |
| PledgeCreateDialog | `pledge-create-dialog.tsx` | 목표 한마디 작성 — 한 줄. 코스변 팻말로 서서 모두에게 보인다 |
| RecordFlexFeed | `record-flex-feed.tsx` | 깅스타그램 — 사진 정사각 격자, 세로 2칸씩 가로로 흐름. 끝에 닿으면 더 불러오기(오프셋). **사진 없는 글은 아예 안 뜬다**. 칸을 500ms 길게 누르면 삭제 |
| RecordFlexCreateDialog | `record-flex-create-dialog.tsx` | 작성 — 사진·한마디·날짜(수치 없음). 필수는 사진·날짜, 한마디는 선택 |
| RecordDeleteDialog | `record-delete-dialog.tsx` | 삭제 확인 — 격자 길게누르기·릴스 휴지통이 **공유**한다. 마일리지런 유입분은 "사진만 지워진다"로 안내가 갈린다 |
| PhotoPicker | `common/photo-picker.tsx` | 사진 한 장 고르기 — 기강이야기·마일리지런 두 폼이 공유(규격·조작감 통일). `size`로 판 크기: `full`(기본, 폼 폭 꽉 참) / `half`(폭 절반 = **면적 1/4**) |
| RequiredMark | `common/required-mark.tsx` | 필수 입력 별표. 표시가 있는 것만 필수(선택 필드엔 안 붙인다) |
| MessageCompose | `message-compose.tsx` | 종이비행기 한마디 작성 — 지면 인라인 한 줄 입력 + 날리기(이륙 연출). 24시간 뒤 사라짐 |
| MessagePlanes | `message-planes.tsx` | 종이비행기 하늘 — 한마디들이 배너로 흐른다. 던진 거리(`fly_dist`)로 고도가 갈림 |
| ThrowStage | `throw-stage.tsx` | 한마디 던지기 — 하늘 안에서 얼굴을 끌다 놓으면 관성으로 휙. 탭만 해도 기본 세기 |
| ActvPile | `actv-pile.tsx` | 활동량 무더기 — 이번 달 활동량 있는 크루원 전원을 점수 비례 크기로 쌓는다(순위 목록 대체) |
| FloatingAvatars | `floating-avatars.tsx` | 떠다니는 아바타 — 지금 /story를 보는 접속자(Realtime presence). 탭하면 튄다(broadcast) |

- 데이터: `getStoryFeed()` (`lib/queries/story-feed.ts`) + `getTeamOverview()` (`lib/queries/team-overview.ts`)
  + `getStoryPosts()` (`lib/queries/story-posts.ts`) + `getStoryPledges()` (`lib/queries/story-pledges.ts`).
  모두 공개 집계만 캐시하고 내 리액션은 클라이언트가 오버레이한다.
- **"팻말·꽂기" 어휘는 목표 한마디 존 전용이다**: 코스변 손팻말(`PledgeSigns`)에만 쓴다.
  깅스타그램은 인스타형 사진 격자라 코스도 팻말도 없으므로 **"올린다/공유한다"**로 말한다
  ("자랑한다"는 운동 성과를 내놓는 뉘앙스라, 일상까지 넓힌 지금은 존을 다시 좁힌다).
  존의 은유가 바뀌면 그 존의 **작성 다이얼로그·토스트·헬퍼 문구까지 함께** 옮겨야 한다 —
  화면에 없는 물건("판에 적혀요", "꽂기")을 가리키는 말이 남으면 사용자는 못 찾는다.
- **목표 한마디는 남고, 종이비행기 한마디는 하루살이**: 목표 한마디(팻말)는 "앞으로 이렇게
  하겠다"는 다짐이라 만료 없이 코스에 쌓이고, 종이비행기 한마디는 "지금 툭 던지는 말"이라
  24시간 뒤 사라진다. 형태로도 수명으로도 구분한다(팻말 ↔ 비행기).
- **종이비행기 한마디는 다시 들어왔다(공유 하늘 + 던지기)**: 목표 한마디(팻말)와는 별개 존이다 —
  목표 한마디가 "다짐"이라면 종이비행기는 "지금 툭 던지는 말"(예: "오늘 한강 6시 같이 뛸 사람")이고,
  24시간 뒤 사라지는 하루살이다. 쓰면(`MessageCompose`) 하늘(`MessagePlanes`)에 배너로 뜨고,
  던지기(`ThrowStage`)로 얼마나 멀리 갔는지가 고도를 정한다. 저장은 던지기를 기다리지 않는다
  (안 던져도 한마디는 이미 올라가 있다). 시안 원본은 `/dev/story-styles` J·K안.
- **목표 한마디는 만료가 없다**: 팻말은 "앞으로"라 하루 만에 지울 이유가 없어 코스변에 계속
  쌓인다(24시간 카운트다운은 종이비행기 한마디 쪽 규칙이다 — 혼동 금지). `lib/story-pledge.ts`엔
  수명·시계 로직이 없고 `dedupePledgesByMember`(1인 1개 정리)만 있다.
- **목표 한마디는 1인 1개**: 새로 쓰면 이전 것이 지면에서 내려간다(`del_yn` 소프트삭제 — 이력은 남긴다).
  DB 유니크 제약은 걸지 않는다(걸면 고쳐 쓰려는 사람이 아무것도 못 올린다) — 화면 정합은
  `dedupePledgesByMember()`(`lib/story-pledge.ts`)가 사람당 최신 1건으로 좁혀 지킨다.
- **목표 한마디 캐시는 피드와 분리**(`story-pledges` 태그 · `get_team_pledges` RPC): 한 건이 큰 피드
  (`get_team_story_feed`, CTE 10개+) 캐시를 끌고 내려가지 않게 record_flex와 같이 떼어 뒀다.
  꽂으면 `pldg_mst` Realtime 구독으로 열린 모든 화면이 함께 갱신된다(알림·댓글과 같은 패턴).
- **기록 격자 칸은 사진만 담는다**(폴라로이드·면 넘기기 폐기): 칸마다 한마디를 얹으면 정작
  사진이 작아지고 격자가 사진이 아니라 종이 무더기로 읽힌다. 한마디·거리·날짜는 칸을 눌러
  여는 릴스 뷰어(`RecordReelViewer`)가 맡는다. 그래서 **작성 다이얼로그의 말도 "판에 적힌다"가
  아니라 "사진을 누르면 함께 보여요"**여야 한다 — 격자에 글이 뜰 거라 기대하게 만들지 않는다.
  면 넘기기·진행 막대도 버렸다(400건이면 한 칸이 3px라 못 누른다).
- **기록 스와이프는 감기지 않는다**: 끝에서 더 밀어도 처음으로 돌아가지 않는다. 리드 배너는
  소식 순환이라 감기지만 여기는 시간순 목록이라, 끝이 있다는 걸 손으로 알 수 있어야 한다.
- **떠다니는 아바타 = 실시간 접속자(`FloatingAvatars`)**: 피드 얼굴이 아니라 **지금 /story를 보고 있는
  로그인 크루원**이다(Realtime **presence** — 열면 track, 나가면 사라짐). 비로그인도 이 하늘을 보되 자기
  아바타는 없다. 탭하면 통통 튀는데 그 **튕김(누구·방향·세기)은 broadcast로 모두에게** 전해져 같은 공을
  주고받고 서로 방해도 된다. 물리는 각자 화면이 돌려 위치는 조금씩 다르고(정밀 동기화 아님), 공이 바닥에
  **안착할 때 그 주인이 위치를 한 번 흘려보내**(pos broadcast) 느슨히 재정렬한다. presence·broadcast는
  DB 복제가 아니라 Realtime 메시징이라 마이그레이션이 없다(목표 한마디 팻말과 다른 점 — 저긴 `pldg_mst`
  postgres_changes 구독이라 테이블이 publication에 올라가 있어야 한다).
- **떠다니는 아바타는 `onPointerDown`으로 받는다**: 매 프레임 움직이는 요소는 down과 up이 같은
  요소 위에서 끝나지 않아 `click`이 통째로 씹힌다. 공중에서 연타하려면 down에서 힘을 실어야 한다.
- **자율 이동은 목표속도 램프로**: 고정 속도로 "굴러/멈춰"를 반복하면 기계벌레처럼 보인다. 매 구간
  목표 속도·방향·길이를 넓게 랜덤으로 뽑고 실제 속도는 목표로 스르륵(lerp) 붙여 가감속을 부드럽게 한다.
- **걸음은 행동 4종 + 사람별 성격**: 좌우 왕복만 하면 다 같은 벌레로 보인다. 바닥 행동을
  `stroll`(어슬렁) · `watch`(멈춰 구경) · `trek`(목적지 잡고 쭉 걷기) · `fidget`(제자리 서성임)으로
  나누고, 어느 걸 얼마나 오래 할지는 `mem_id` 해시로 뽑은 **고정 성격**(`getPresencePersona` —
  걸음속도·멈춤성향)이 정한다. 성격을 매번 랜덤으로 뽑으면 모두가 평균으로 수렴해 결국 다 똑같아진다.
  `watch` 중에도 아주 느린 sway를 주는데, 완전 정지는 살아있지 않고 죽어 보이기 때문이다.
- **색은 사람에게 고정**(`lib/story-presence.ts`): 링·이름표 색을 `mem_id` 해시로 묶어 사람마다 항상
  같은 색이 나온다. 클릭마다 랜덤이면 "누가 치고 있나"가 아무 정보도 안 남지만, 고정이면 몇 번 보다
  "저 초록이 준민"이 학습돼 남이 내 공을 튕겨도 누군지 색으로 읽힌다. broadcast엔 색 대신 아무것도
  싣지 않는다 — 받는 쪽도 같은 해시로 같은 색을 계산하므로.
- **이름표는 얼굴 아래, 회전은 얼굴만**: 아바타만 있으면 누군지 모른다. 다만 굴러가는 요소라 이름까지
  같이 돌면 못 읽으므로 `rotate`는 안쪽 얼굴 래퍼에만 걸고 이름표는 바깥에 세워 둔다.
- **"지금 보는 중 N" 라벨은 바닥선 위에 겹쳐 띄운다**: 이 얼굴들이 접속자라는 걸 모르면 그냥 장식으로
  보인다. 라벨은 아바타가 걷는 **바닥선 옆**에 있어야 저 얼굴들 설명으로 읽히고(위엔 리드 kicker가 있어
  겹친다), 자기 자리를 따로 갖지 않고 **바닥선 위에 겹쳐 뜬다**(`BADGE_LIFT`) — 라벨 몫으로 띠를 잡으면
  이름표까지 더해져 리드 아래 여백만 커진다. 얼굴은 지나가고 라벨은 흐린 보조 텍스트라 가려지는 건
  한순간이다. 설명(`HelpTip`)은 붙이지 않는다: 점멸 점 + 인원수면 "지금 몇 명이 보고 있다"는 읽히고,
  탭하면 튄다는 건 한 번 눌러보면 아는 것이라 물음표를 세울 값이 아니다.
  story-client의 하단 패딩은 **이름표(`LABEL_H`) 몫만** 더해 잡는다 — 한쪽만 바꾸면 아바타가 리드
  진행 막대를 다시 가린다.
- **깅스타그램 캐시는 피드와 분리**(`story-posts` 태그): 올린 글은 즉시 보여야 하고 피드 본문은 5분이면
  충분하다. 한 태그로 묶으면 자랑 한 건이 피드 전체 캐시를 끌고 내려간다. RPC도 `get_team_posts`로
  갈라 뒀다 — `get_team_story_feed`는 이미 CTE 10개+라 존을 더 얹지 않는다.
- **깅스타그램은 운동기록이 아니라 일상 공유다**(2026-07-28 확장): 처음엔 "운동기록 자랑"으로
  좁게 열었는데, 실제로 올라오는 건 운동 사진만이 아니다. 이 존은 **기강인의 일상을 나누는
  자리**이고 운동은 그중 하나다 — 그래서 존 이름도 종목이 아니라 **깅스타그램**이다.
  화면 문구는 "운동기록"이라고 부르지 않는다(존 헤더 리드 "우리가 남긴 발자국", HelpTip
  "운동이든 일상이든"). 코드 식별자(`record_flex` · `RecordFlexFeed`)는 초기 이름 그대로
  두되 — 테이블 enum·RPC·트리거까지 걸린 이름이라 바꾸면 마이그레이션이 줄줄이 따라온다 —
  **사용자에게 보이는 말만** 넓힌다. 마일리지런 유입 안내문도 "깅스타그램에도 등록돼요".
- **사진이 있어야 선다**: 이 지면의 매개는 **수치가 아니라 사진**이다(겨루는 자리가 아니라
  친목·응원이라서). 그래서 기강이야기 작성 폼엔 **거리·종목이 없고**(사진·한마디·날짜 셋뿐),
  사진 없는 글은 지면에 아예 안 뜬다. **필수는 사진과 날짜뿐 — 한마디는 선택**이다
  (사진이 지면에 서는 조건이고 글은 거든다. 마일리지런 후기도 선택이라 두 경로 규칙이 여기서 맞는다). 예전엔 사진이 없으면 프로필사진으로 칸을 채웠는데, 그러면
  격자가 기록이 아니라 **얼굴 무더기**로 읽혔다. 거르는 곳은 `get_team_posts` RPC
  (`photo_url IS NOT NULL`) 한 곳 — 클라이언트(격자·릴스·리드)는 폴백을 갖지 않는다.
- **삭제는 출처에 따라 갈린다**(`deleteRecordFlex`): 직접 올린 것(`manual`)은
  `post_mst.del_yn = true` + Storage 파일 제거. 마일리지런 유입분(`mlg_auto`)은 post를 직접
  지우면 **되살아난다** — 위 트리거가 `ON CONFLICT ... DO UPDATE SET del_yn = false`라 원본을
  나중에 한 번이라도 수정하면 지운 게 다시 올라온다. 그래서 원본
  (`evt_mlg_act_hist.photo_url`)을 null로 만들어 **트리거가 스스로 내리게** 한다. 사진이 이
  지면에 서는 유일한 조건이므로 "사진을 뗀다 = 여기서 내린다"가 성립하고, 마일리지런 쪽
  거리·후기는 그대로 남는다. 권한은 **작성자 본인 또는 관리자**(댓글 삭제와 같은 경계)이고
  서버가 다시 판정한다 — 버튼을 감추는 건 안내일 뿐 post_id만 알면 액션은 직접 호출된다.
  진입점은 **격자 길게누르기(500ms)와 릴스 상단 휴지통** 둘이며, 확인 다이얼로그
  (`RecordDeleteDialog`)는 **하나를 공유**한다(각자 만들면 유입분 안내를 한쪽만 빠뜨린다).
  문구는 "이 사진을 삭제할까요?" — "추억"은 방금 올린 걸 바로 지울 때 어색해지고, "기록"은
  일상 공유로 넓힌 지금의 이 존을 다시 운동으로 좁힌다.
- **수치가 필요하면 마일리지런에서 올린다**: 마일리지런은 반대로 **수치가 본체**라 사진이 선택값이다.
  다만 사진을 붙이면 그 기록이 기강이야기에도 함께 선다 — 같은 걸 두 번 올리지 않게. 그래서 두 폼의
  공통분모는 **사진·한마디(후기)·날짜** 셋이고, 갈리는 건 **사진의 필수 여부**뿐이다
  (기강이야기=필수 / 마일리지런=선택. 한마디는 양쪽 다 선택). 사진 필드 아래 안내문(`text-primary` —
빨강은 같은 화면의 오류 메시지와 겹쳐 "입력이 잘못됐다"로 읽힌다. 이건 경고가 아니라 안내다)
  ("사진 추가 시, 기강이야기의 깅스타그램에도 등록돼요")으로 **누르기 전에** 알린다 — 공개는 되돌리기
  어려워 사후 안내로는 늦다. 유입된 기록은 ⚡ 배지로만 구분한다(수치를 격자에 다시 적지 않는다).
- **유입 게이트는 후기가 아니라 사진**(`post_sync_from_mlg_act` 트리거): 예전 규칙은 "후기가 있으면
  전광판에 뜬다"였다. 지금은 뜨는 기준이 사진이므로 후기만 있는 기록은 post를 만들지 않는다 —
  만들어도 위 RPC 필터에 걸려 **안 보이는 유령 행**이 된다. 사진을 떼면 대응 post가 내려가고
  다시 붙이면 되살아난다(`del_yn` 소프트삭제 + `uq_post_mst_ref` 멱등).
  사진 URL은 **원본 테이블**(`evt_mlg_act_hist.photo_url`)에 둔다: 트리거는 Storage에 파일을
  올릴 수 없어 앱이 업로드하고 트리거는 URL만 복사한다. 원본이 들고 있어야 수정·삭제까지 트리거
  한 곳에서 동기화가 유지된다(앱이 두 테이블에 각각 쓰면 한 갈래만 빠뜨려도 유령이 남는다).
  **사진 필수는 DB 제약으로 걸지 않는다** — 이미 쌓인 사진 없는 행이 인질이 된다. 쓰기 시점은
  앱(zod+서버 액션), 읽기 시점은 RPC 필터가 맡는다.
- **사진**: `post-photos` 버킷(멤버별 폴더). 아바타(512 정사각 crop)와 달리 비율 유지·폭 1080 제한.
  처리(HEIC 변환·EXIF 회전·리사이즈·업로드)는 `lib/storage/post-photo.ts` 한 곳에서 — 두 경로가
  공유한다(각자 만들면 한쪽만 EXIF 회전을 빠뜨려 사진이 눕는 걸 눈으로만 알게 된다).
  업로드를 먼저 하고 INSERT를 나중에 하되, INSERT가 실패하면 올린 파일을 지운다(고아 방지).
  마일리지런은 업로드가 **별도 액션**(`uploadActivityPhoto`)이다 — 기록 저장이 배율·고도까지 실은
  JSON 액션이라 `File`을 못 태운다. 사진을 갈아끼우거나 지우면 이전 파일도 Storage에서 치운다.
  **다건 입력(FAB "기록 입력")도 기록마다 사진을 받는다** — 프로젝트탭의 주 진입점이 이쪽이라
  여기 빠지면 사실상 사진을 못 올린다. 다만 업로드는 **저장을 누를 때 한 번에** 한다(고를 때마다
  올리면 취소 시 고아 파일이 20개까지 쌓인다). 순서도 **검증 먼저 → 업로드 나중**이다 —
  뒤집으면 3번째 기록의 거리가 비었을 때 이미 올린 두 장이 고아로 남는다.
- **리드 슬롯은 kicker / body / footer 3밴드로 고정**(`story-lede.tsx`): 슬롯마다 자기 레이아웃을
  통째로 그리던 걸 밴드로 묶었다. **kicker**는 맨 위, **body**는 남는 높이를 전부 흡수, **footer**는
  `mt-auto`로 바닥 고정 — 왼쪽에 이 슬롯의 *한 줄 사실*(D-day·완주시간·날짜·거리·가입목적),
  오른쪽에 응원. 예전엔 응원 버튼이 슬롯마다 다른 자리(가입목적 옆·날짜 옆·D-day 옆·프로필
  안쪽)에 박혀 바닥에서 15~71px로 흩어져 있었다 — 4초마다 넘어가는 지면에서 연타하려면 손가락을
  매번 옮겨야 했다. 지금은 **전 슬롯 17px**로 같다.
  - 슬롯은 `hero`로 **주인공**을 선언한다: `headline`(글) · `photo`(사진) · `figure`(수치).
    `headline`일 때만 상단에 26px 헤드라인을 세우고, 나머지는 body가 위까지 쓴다. 렌더에서
    `!lede.photo && !lede.profile && …`로 되묻던 조건 세 벌이 이걸로 사라졌다.
  - **헤드라인은 `.lede-headline` 한 클래스**(globals.css). 2줄에서 자르고 넘치면 `…`.
    슬롯별로 clamp가 2/2/3/6으로 제각각이던 걸 한 곳으로 모았다 — 줄 수는 `--lede-headline-lines`
    한 줄만 고친다. **예약 높이(min-height)는 두지 않는다**: footer가 바닥에 고정돼 있어 헤드라인이
    1줄이든 2줄이든 응원 버튼이 안 움직이고 남는 높이는 body가 흡수한다. "몇 줄을 미리 잡아둘까"를
    정할 필요 자체가 없어진다.
  - 슬롯 높이 **264px**. footer를 독립 밴드로 빼면 그만큼 예산이 필요한데, 예전 224px을 유지하면
    헤드라인이 2줄이 되는 순간 활동지수·새 얼굴 슬롯이 30px씩 잘린다. 내용을 깎는 대신 지면을 줬다.
    바닥을 정하는 건 **새 얼굴 슬롯**이다 — 프로필을 다 채운 신입(러닝프로필 3행 + 소개 한마디 +
    가입목적)에 헤드라인이 2줄로 겹치면 3px쯤 모자라지만, 두 악조건이 동시에 오는 경우가 드물어
    268 대신 264를 택했다.
  - ⚠️ **높이 측정은 반드시 375px 뷰포트에서** 한다. 창을 줄이는 방식은 브라우저 최소 폭(500px)에
    걸려 더 넓은 화면을 재게 되고, 그러면 헤드라인이 1줄로 접혀 "여유가 있다"는 잘못된 결론이
    나온다(실제로 260px까지 내렸다가 되돌렸다). 기기 에뮬레이션을 쓸 것.
  - body 안 내용은 **세로 가운데**에 앉힌다. 위로 붙이면 내용이 짧은 슬롯(소개 한마디가 없는
    새 얼굴 등)에서 헤드라인과 footer 사이가 통째로 비어 보인다.
  - **다섯 슬롯 모두 응원을 받는다.** 깅스타그램의 응원 대상은 **글이 아니라 올린 사람**이다 —
    `entity_type = "actv"` + mem_id로 활동지수·목표 한마디 슬롯과 같은 멤버 기준 카운터를 쓴다.
    처음엔 글 단위(`"post"` + post_id)로 붙였는데, 이 슬롯은 매 진입마다 16건 중 **랜덤 1건**을
    세우므로 방금 응원한 글이 다음 진입엔 거의 안 돌아온다 — 카운터는 DB에 정상 누적되는데도
    "눌러도 반영이 안 된다"로 보였다. 사람 기준이면 어느 기록이 떠도 응원이 이어서 쌓인다.
    같은 사람이 여러 슬롯에 대표로 뜨면 🔥가 합산되는 건 의도다("그 사람을 응원").
    `"post"` 타입은 **레거시로만 남긴다** — 이미 쌓인 행을 읽기 위한 것이고 새로 쌓지 않는다.
    관문은 `StoryEntityType` 유니온 · `bump-reaction`의 `ENTITY_TYPES` · `isOnBoard` 세 곳이며,
    `actv` 검증은 활동지수 랭킹 / 목표 팻말 / **깅스타그램 작성자**(`story-posts` 캐시) 세 출처를
    본다 — 랭킹만 보면 랭킹 밖 멤버가 올린 기록에 응원할 때 거부된다.
    릴스 뷰어·격자에는 아직 응원이 없다 — 리드와의 불일치는 별도 건.
- **리드 슬롯**: 종류당 **한 칸**이다. 신규 멤버가 넷이라고 네 칸을 쓰면 스와이프가 명단 낭독이 된다.
  가장 최근 1명(1건)을 대표로 크게, 나머지는 우측 레일(`w-12` + 세로 괘선)에 작게 — 빠지는 사람이 없게.
  자동 전환 5초, 손이 닿으면 10초 멈췄다 반응이 없으면 스스로 재개한다(영구 정지 금지).
- **리드 랜덤은 "한 바퀴마다" 갱신**: 랜덤이 있는 슬롯(새얼굴·기록·목표 한마디·활동지수·깅스타그램)은 초기값을
  **서버가 뽑아** 넘기고(`initial*Pick` — 첫 화면부터 랜덤·하이드레이션 안전, `story/page.tsx`),
  이후엔 **자동전환/수동 스와이프가 마지막 장을 지나 처음으로 완주하는 순간에만** 한꺼번에 재추첨한다
  (`rerollAllPicks`). 한 사이클 내내는 고정 — 뒤로 스와이프해도 방금 본 슬롯이 안 바뀐다(매 전환마다
  굴리면 이전 걸 다시 보려다 새 걸 보게 된다). 뒤로 감길 땐(처음→마지막) 굴리지 않는다. "다가오는
  대회"만 고정(가장 임박한 1건). 렌더 본문에 `Math.random` 금지 — 굴리는 건 타이머 콜백 안에서만.
- **활동지수 슬롯("이번 달 기강 잡는")**: 이번 달 활동량 상위 3명 중 하나(랜덤)를 **소개**한다 —
  활동량 수치·순위는 노출하지 않는다("포인트"는 히든 운영). 우측 레일 없이 대표 1명을
  `PersonProfile` 부품 조합(칭호·소개 한마디·개인 최고기록·러닝 프로필)으로 그린다. 개인 최고기록은
  **가장 긴 거리 종목 1건** — `get_team_story_feed`의 `actv_rank`가 `comp_evt_type` 문자열에서 거리를
  유도해(NNK 정규식 + FULL/HALF/OLYMPIC 등 매핑, 파싱 불가는 최고기록 폴백) 뽑아 준다.
- **목표 한마디 슬롯("여러분께 고합니다")**: 코스변 팻말(`PledgeSigns`)에 꽂힌 목표 중 하나(랜덤)를
  활동지수 슬롯과 **같은 방식**으로 그린다 — 명조 헤드라인=목표 문장 + `PersonProfile` 부품
  (`parts: ["title", "intro"]` — 칭호·소개만, 최고기록·러닝프로필은 뺀다. 목표 문장이 이미 헤드라인이라
  부품을 더하면 시선이 흩어진다). 그래서 `get_team_story_feed`의 `pledges`가 `actv_rank`처럼
  칭호·소개·배지·프레임을 함께 실어 준다(러닝프로필·최고기록은 안 실음). **응원 대상은 목표 팻말이
  아니라 그 목표를 쓴 사람**이다 — `buildEntity("actv", mem_id, "fire")`로 활동지수 슬롯과 같은
  멤버 기준 카운터를 쓴다. 그래서 같은 사람이 두 슬롯에 모두 대표로 뜨면 🔥 응원이 합산된다
  (의도 — "그 사람을 응원").
- **오버뷰(팀 심박수)**: 크루 상태를 **먼저 말하고 근거를 뒤에** 붙인다. 전폭 밴드가 상태를 말하고
  (파형 + BPM + 한 단어), 그 아래 한 줄이 이번 달 근거를 댄다. 단계 판정 구조(`MoodLevel` 4단계)는 프로필 카드의 개인
  컨디션(`getActivityMood`)과 같지만, 라벨·멘트 텍스트는 공유하지 않는다(`lib/team-pulse.ts`의
  `TEAM_PULSE_SCALE`) — 심전도/BPM 그래픽에 맞춘 러닝 페이스·존 은유(심장 폭발/꾸준한 페이스/
  가벼운 조깅/완전 휴식)를 쓴다. 판정은 이번 주를 직전 4주 평균과 견준 비율이다(크루 규모마다
  절대값이 달라서). 이때 주는
  **같은 요일 경과 시점끼리** 비교한다 — `get_team_overview` RPC가 과거 4주도 이번 주와 같은
  요일까지만 세어 주므로(월요일=지난 4주의 월요일까지), 월요일에 심박이 무조건 죽는 톱니가 없다.
  활발할수록 심박이 빠르고 진폭이 크며, 최소 단계는 느리고 얕게 뛴다(완전 평선은 만들지 않는다 —
  활동이 적은 것과 죽은 것은 다르다).
- **심전도는 전폭 어두운 띠(`bg-board`) 위에 올린다**: `--pulse-neon`의 glow는 밝은 배경에서 빛나지
  않고 뿌옇게 번지기만 한다(§Board 토큰). 카드로 띄우지 않고 **화면 좌우 끝까지** 붙인다 — 흰 지면
  중간에 떠 있는 검은 상자는 광고 배너로 읽히지만, 지면을 가로지르는 띠는 끼워 넣은 계기 출력물로
  읽힌다. 배치도 실제 모니터를 따른다: 왼쪽에 파형, 오른쪽에 판독값(BPM + 한 단어). 판독 숫자는
  파형과 **같은 청록**으로 찍는다(모니터가 그렇다). `--board-amber`는 여기서도 안 쓴다.
- **파형 박자 수는 폭이 정한다**(`HeartRate`의 `beats`): `preserveAspectRatio="none"`이라 폭이
  넓어지면 파형이 그만큼 가로로 늘어난다 — 전폭에 1박자면 스파이크가 1.9배 퍼져 심전도가 아니라
  구불구불한 선이 된다. 전폭 밴드는 2박자. 이때 훑는 속도(`--ecg-dur`)와 보이는 구간
  (`--ecg-dash-*`)이 **박자 수에 비례해 함께** 늘어나야 초당 박동 수가 안 변한다 — 한쪽만 바꾸면
  2박자에서 심박이 두 배로 빨라진다.
- **수치 격자(2x2)는 걷어냈다**: 28px 숫자 네 개가 22px 심박 하나보다 시각적으로 네 배 무거워
  주인공이 조연에게 밀려 있었다. 게다가 `회원`은 크루 총량(기간 무관)이고 나머지는 이번 달 값이라
  똑같이 생긴 칸에 시간 기준이 두 개 섞여 있었고, 그걸 수습하려고 **"M월 합계" 각주**가 필요했다.
  근거를 이번 달 3개(모임·참석·기록)로 좁히고 기간을 줄 맨 앞에 한 번만 쓰니 각주가 저절로 사라졌다.
  기간 라벨은 오늘이 아니라 **수치가 실제로 덮는 달**(`months.at(-1).m_start`)에서 뽑는다.
- **회원 수는 숫자가 아니라 리드문에 넣는다**("기강인 42명의 이번 주 심박"): "얼마나 뛰었나"가 아니라
  "누가 있나"라 이번 달 수치와 성격이 다르고 거의 변하지 않는다. 큰 숫자로 세우면 심박과 경쟁하지만
  리드문 안에서는 심박의 *모집단*을 알려주는 배경이 된다. 존 리드 슬롯이 원래 **안 변하는 설명**을
  맡는 자리라는 점도 맞아떨어진다. 0명이면(조회 실패) 숫자 없는 리드로 물러난다 — "기강인 0명"은
  고장으로 읽힌다.
- **상태 멘트는 리드가 아니라 밴드 캡션이다**: 리드 슬롯은 매주 바뀌는 값이 아니라 고정 설명을 담는
  자리라, 멘트를 거기 넣으면 존마다 슬롯 직무가 어긋난다. 대신 밴드 바로 아래 **우측정렬**로 건다 —
  밴드 우측의 `BPM / 한 단어`와 같은 오른쪽 끝에 맞물려 그 숫자에 딸린 캡션으로 읽힌다. 왼쪽에 두면
  밴드와 무관한 별개 문장처럼 떠 있다.
- **심박 눈금은 ratio가 정하고 BPM은 그 환산값이다**(`lib/team-pulse.ts`):

  | 단계 | ratio (정본) | BPM (환산) |
  |------|-------------|-----------|
  | 완전 휴식 | ~0.6 | 50~103 |
  | 가벼운 조깅 | 0.6~0.9 | 104~130 |
  | 꾸준한 페이스 | 0.9~1.3 | 131~169 |
  | 심장 폭발 | 1.3~ | 170~200 |

  ratio → BPM은 **1.0에서 꺾이는 두 직선**이다 — `ratio ≤ 1`은 `50 + 90·ratio`(0배→50, 1.0배→140),
  `ratio > 1`은 `140 + 100·(ratio-1)`(1.6배→200에서 클램프). 상수가 전부 뜻을 갖는다.
  - **`ratio 1.0`(평소만큼)은 반드시 `꾸준한 페이스`다** — 그 말이 곧 "평소대로"라는 뜻이라서.
    경계가 이걸 못 지키면(1.0이 `가벼운 조깅` 맨 위에 걸리는 등) 라벨이 거짓말을 한다.
  - **`log2`를 걷어냈다**: `log2(0)`이 -∞라 예전 식(`120 + 125·log2(ratio)`)은 ratio 0.68 아래가
    전부 음수로 계산돼 **하한 50에 뭉쳤다**. `완전 휴식`·`가벼운 조깅`·`꾸준한 페이스` 아래쪽이
    같은 파형·같은 숫자로 나와 라벨만 다른 상태가 됐다 — 계기가 고장난 것처럼 읽혔다.
  - **경계는 ratio로 적고 BPM은 `ratioToBpm`으로 환산해 쓴다**(`LEVEL_RATIO_FLOORS`). BPM 하한을
    직접 상수로 박으면 앵커(`BPM_PAR`·`RATIO_TOP`)를 조정하는 순간 경계가 조용히 어긋난다.
  - **단계는 화면에 찍히는 BPM에서 읽는다**: 예전엔 단계는 ratio 임계값으로, 숫자는 ratio를
    매핑한 BPM으로 **따로** 뽑았다. 같은 ratio에서 나왔어도 클램프가 끼면 어긋나,
    `50 bpm / 가벼운 조깅`과 `50 bpm / 완전 휴식`이 나란히 뜰 수 있었다. 눈금 하나에서 둘 다
    읽으면 숫자와 라벨이 어긋나는 일이 **구조적으로** 불가능해진다.
- **응원**: 탭은 즉시 반영하고 서버 전송은 700ms 디바운스로 모은다. `revalidateTag`를 부르지 않는다 —
  연타마다 무효화하면 `story-feed` 캐시가 남아나지 않는다. 표시 상수·한도는 `lib/story-reaction.ts` 한 곳.
- **활동량**: 화면 명칭은 "활동량"으로 통일하고 제도 이름(포인트)은 쓰지 않는다. 집계는 **매달**(`aply_dt` 기준,
  1일 초기화) — 경계는 `lib/activity-index.ts`의 `getActvMonthRange()`가 정본이고 랭킹·내역이 이걸 공유한다.

### 가입 위저드 (`components/auth/`, `components/`)

| 컴포넌트 | 파일 | Props | 용도 |
|----------|------|-------|------|
| SignupProgress | `auth/signup-progress.tsx` | `step` (1\|2\|3), `done?` | 가입 위저드 3단계 공유 진행바 (newbie·login·onboarding 상단 고정) |
| PwaInstallPrompt | `pwa-install-prompt.tsx` | `variant` ("banner"\|"inline") | 홈 화면 설치 유도. standalone·인앱이면 미표시. banner=전역 하단(7일 dismiss), inline=가입 완료 화면 |
| PushPermissionPrompt | `push-permission-prompt.tsx` | — | 첫 진입 푸시 알림 권한 유도 배너(전역 하단). 데스크톱·iOS미설치 미표시, 거부 시 영구 dismiss. 띄울 때 설치 배너 억제 |

---

## 사용 규칙

### 페이지 작성 시

```tsx
import { PageHeader } from "@/components/common/page-header";

<div className="flex flex-col gap-0">
  <PageHeader title="페이지 제목" />
  <div className="flex flex-col gap-7 px-6 pb-6">
    {/* 섹션들 */}
  </div>
</div>
```

### 섹션 작성 시

```tsx
import { SectionHeader } from "@/components/common/section-header";

<div className="flex flex-col gap-4">
  <SectionHeader label="SECTION NAME" action={{ label: "모두 보기", href: "/path" }} />
  {/* 콘텐츠 */}
</div>
```

### 텍스트

```tsx
import { H1, Body, Caption, SectionLabel } from "@/components/common/typography";

<H1>기강</H1>
<Body className="font-semibold">홍길동</Body>
<Caption>서울 · 4/12</Caption>
<SectionLabel>TEAM OVERVIEW</SectionLabel>
```

### 빈 상태

```tsx
import { EmptyState } from "@/components/common/empty-state";

<EmptyState variant="card" message="등록된 기록이 없습니다." />
<EmptyState icon={Trophy} message="아직 대회 기록이 없습니다." />
```

### 통계 그리드

```tsx
import { StatCard } from "@/components/common/stat-card";

<div className="grid grid-cols-2 gap-3">
  <StatCard value={42} label="활동 멤버" />
  <StatCard value={5} label="예정 대회" />
</div>
```

### 탭 전환

```tsx
import { SegmentControl } from "@/components/common/segment-control";

<SegmentControl
  segments={[
    { value: "gigang", label: "기강 대회" },
    { value: "all", label: "전체 대회" },
  ]}
  value={tab}
  onValueChange={setTab}
/>
```

### 아바타

```tsx
import { Avatar } from "@/components/common/avatar";

<Avatar src={member.avatar_url} seed={member.id} size="md" />  // sm=32px, md=40px, lg=56px, xl=64px
```

- `seed`(멤버 id 권장)를 넘기면 프사 미설정 시 DiceBear 랜덤(고정) 아바타로 폴백. **멤버 아바타는 항상 `src`+`seed`를 함께 전달.**
- 폴백 스타일은 `avatar.tsx`의 `FALLBACK_AVATAR_STYLE` 한 곳에서 관리 (스타일 교체 시 이 상수만 수정).
- `seed`도 없으면 `fallbackIcon`(기본 UserRound)으로 폴백.

### 정보 행 목록

```tsx
import { InfoRow } from "@/components/common/info-row";

<div>
  <InfoRow label="이름" value="홍길동" />
  <InfoRow label="이메일" value="runner@gigang.kr" />
  <InfoRow label="계좌번호" />  {/* 값 없으면 "-" 표시 */}
</div>
```

---

## AI를 위한 규칙

1. **텍스트**: `text-[28px]` 등 매직넘버 금지 → `<H1>`, `<Body>`, `<Caption>` 등 타이포그래피 컴포넌트 사용
2. **페이지 헤더**: `PageHeader` 컴포넌트 사용 (직접 h-14 div 작성 금지)
3. **섹션 라벨**: `SectionHeader` 컴포넌트 사용 (tracking-widest 직접 작성 금지)
4. **빈 상태**: `EmptyState` 컴포넌트 사용 (CardItem variant="dashed" 직접 조합 금지)
5. **탭 UI**: `SegmentControl` 컴포넌트 사용
6. **통계 카드**: `StatCard` 컴포넌트 사용 (CardItem + text-2xl 직접 조합 금지)
7. **프로필 사진**: `Avatar` 컴포넌트 사용 (rounded-full + img + fallback 직접 작성 금지)
8. **정보 표시**: label-value 쌍은 `InfoRow` 사용
9. **카드 래퍼**: 모든 카드는 `CardItem` (outlined/dashed) 사용, 커스텀 border 작성 금지
10. **색상**: CSS 변수 토큰만 사용, 하드코딩 RGB/hex 금지
11. **컴포넌트 위치**: shadcn 설치 컴포넌트 → `ui/`, 프로젝트 공통 → `common/`, 도메인별 → `auth/`, `races/` 등
12. **환경변수**: `process.env` 직접 접근 금지 → `lib/env.ts`에서 import
13. **기능 설명**: 설명이 필요한 지표·규칙 옆에는 `HelpTip` 사용 (커스텀 툴팁 작성 금지)
14. **폼 검증**: Zod 스키마는 `lib/validations/`에 정의, React Hook Form의 `zodResolver`와 통합
