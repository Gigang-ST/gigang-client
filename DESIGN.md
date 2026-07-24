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

### 전광판 스크린 존 (Board) — 프로필 카드 전용

| 토큰 | Tailwind 클래스 | 용도 |
|------|----------------|------|
| `--board` | `bg-board` | 전광판 유리 배경 (스크린 존) |
| `--board-foreground` | `text-board-foreground` | 스크린 존 텍스트 |
| `--board-muted` | `text-board-muted` | 스크린 존 보조 텍스트 |
| `--board-line` | `border-board-line` | 도트리더·구분선 |
| `--board-amber` | `text-board-amber` | LED 앰버 — LIVE·NEW·등번호·D-day |

**라이트/다크 공통값**(`.dark`에서 재정의하지 않음). 프로필 카드 상단만 항상 야간으로 남겨,
glow 기반 프레임 22종·칭호 이펙트 48종이 두 테마 모두에서 발광하게 하는 무대다.
`--board-amber`는 **스크린 존 밖에서 쓰지 않는다**.

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

**HelpTip은 앱 전역 공통 패턴이다.** 설명이 필요한 지표·규칙 옆에 붙여 "이게 뭔가"를 그 자리에서 답한다
(게임 UI의 물음표 버튼과 같은 역할). 새 기능에 설명이 필요하면 별도 툴팁을 만들지 말고 이걸 쓴다.
아이콘은 14px이지만 히트 영역은 32px — 손가락으로 눌러야 하므로.

### 멤버 프로필 카드 (`components/members/`)

| 컴포넌트 | 파일 | Props | 용도 |
|----------|------|-------|------|
| MemberCardCompact | `member-card.tsx` | `memId`, `data`, `meta?`, `onSelect?` | 간단 카드 — "이 사람이 누구인지". 한마디 + 러닝 프로필 한 줄. `meta`는 우측 슬롯(가입일 등), `onSelect`를 주면 카드 전체가 버튼 |
| MemberCardDetail | `member-card-detail.tsx` | `memId`, `data`, `onEditIntro?` | 상세 카드 — 스크린 존 + RECORDS/ACTIVITY/TITLES. `onEditIntro`를 주면 한마디에 연필이 생긴다 |
| MemberCardDialog | `member-card-dialog.tsx` | `memId`, `memNm?`, `teamId`, `open`, `onOpenChange`, `stacked?`, `isOwner?` | 오픈 시 RPC 1회 + 스켈레톤·재시도·탈퇴 폴백. `stacked`로 다른 시트 위에 겹침 |
| IntroEditDialog | `intro-edit-dialog.tsx` | `open`, `onOpenChange`, `initialValue`, `onSaved?`, `stacked?` | 한마디 한 줄 인라인 편집(페이지 이동 없음) |

- **간단 vs 상세**: 간단 카드는 "이 사람이 누구인지"(한마디·러닝 프로필), 상세 카드는 "이 사람의 실적"
  (RECORDS/ACTIVITY/TITLES). 실적이 없는 신규 멤버도 채워지도록 간단 카드에는 수치를 넣지 않는다.
- 데이터: `getPublicMemberCard()` (`lib/queries/member-card.ts`) — `null`이면 "함께 달렸던 멤버" 폴백.
  간단 카드는 `MemberCardCompactData`(좁힌 표면)만 요구해 피드 RPC payload로도 그릴 수 있다.
- 표시 규칙(컨디션 4단계·종목 라벨·NEW 판정·D-day·러닝 프로필)은 `lib/member-card.ts` 한 곳에서 관리.
- 모션: `.board-flicker` / `.board-cone` / `.board-rise*` (globals.css) — `prefers-reduced-motion` 존중.

### 기강 전광판 (`components/story/`)

| 컴포넌트 | 파일 | 용도 |
|----------|------|------|
| StoryClient | `story-client.tsx` | 전광판 본문 — 리드 + 기상대 + 존 3개 + 프로필 카드 진입 |
| StoryLede | `story-lede.tsx` | 1면 리드 — 종류당 한 칸(대회·새얼굴·기록·참가왕). 좌측 메인 + 우측 레일 |
| StoryWeather | `story-weather.tsx` | 기강 기상대 — 크루 분위기 한 단어 + 수치 격자 + 8주 추세 |
| StoryReactionButton | `story-reaction-button.tsx` | 응원 카운트업 — 누른 만큼 오른다(취소 없음, 1인 99회) |
| ActvHistorySheet | `actv-history-sheet.tsx` | 활동량 내역 바텀시트 — 이번 달 획득 내역 날짜 역순 + 합계 |
| PledgeSigns | `pledge-signs.tsx` | 각오 팻말 — 코스변 손팻말, 가로 스크롤. 24시간 카운트다운 후 내려감(Realtime) |
| PledgeCreateDialog | `pledge-create-dialog.tsx` | 각오 작성 — 한 줄(24자). 24시간 뒤 내려간다고 미리 알린다 |
| RecordFlexFeed | `record-flex-feed.tsx` | 기록 자랑 폴라로이드 피드 — 2x2 한 면, 좌우 스와이프로 과거 |
| RecordFlexCreateDialog | `record-flex-create-dialog.tsx` | 기록 작성 — 사진·한마디·종목·거리·날짜 |

- 데이터: `getStoryFeed()` (`lib/queries/story-feed.ts`) + `getTeamOverview()` (`lib/queries/team-overview.ts`)
  + `getStoryPosts()` (`lib/queries/story-posts.ts`) + `getStoryPledges()` (`lib/queries/story-pledges.ts`).
  모두 공개 집계만 캐시하고 내 리액션은 클라이언트가 오버레이한다.
- **각오는 하루살이, 기록은 남는다**: 각오(팻말)와 기록 자랑(폴라로이드)은 형태로도 수명으로도
  구분한다 — 각오는 "앞으로"라 24시간 뒤 내려가고, 기록은 "이미 한 것"이라 지면에 쌓인다.
  종이비행기(공유 하늘·착륙장·띄우기)는 걷어냈다: 각오가 하루살이가 되면서 띄울 대상도
  내려앉을 자리도 없어졌다(시안 원본은 `/dev/story-styles` J·K안).
- **각오는 24시간**: 꽂은 순간 `24:00:00`에서 줄어들어 0이 되면 코스에서 사라진다. 기준은
  `float_at`이 아니라 **`crt_at`(쓴 시각)** — 띄우기가 없어져 float_at을 갱신할 경로가 없고,
  "올린 지 24시간"이 사용자가 이해하는 규칙이다. 수명·시계는 `lib/story-pledge.ts`
  (`PLEDGE_TTL_MS`·`pledgeRemainMs`·`pledgeCountdown`) 한 곳이 정본.
  **행은 지우지 않는다** — 화면에서 빼는 것과 데이터를 없애는 건 다른 일이라 이력은 남긴다.
- **만료는 서버·클라 양쪽에서 거른다**: `get_team_pledges` RPC가 24시간 지난 걸 애초에 안 주고
  (안 그러면 조회 상한 20건이 만료분으로 채워진다), 페이지를 열어둔 채 만료 시각을 넘긴 화면은
  `PledgeSigns`의 1초 타이머가 치운다(서버만으로는 `00:00:00`에 멈춘 팻말이 남는다).
  리드의 각오 칸도 같은 24시간을 적용하되 1분 간격으로 본다 — 거기선 초를 표시하지 않으므로.
  `feed.pledges`(큰 피드 RPC)에는 만료 필터가 없어 `story-lede.tsx`가 클라에서 거른다:
  `get_team_story_feed`는 CTE 10개+라 존 하나 때문에 다시 배포할 이득이 없다.
- **각오는 1인 1개**: 새로 쓰면 이전 각오가 지면에서 내려간다(`del_yn` 소프트삭제 — 이력은 남긴다).
  DB 유니크 제약은 걸지 않는다(걸면 고쳐 쓰려는 사람이 아무것도 못 올린다) — 화면 정합은
  `dedupePledgesByMember()`(`lib/story-pledge.ts`)가 사람당 최신 1건으로 좁혀 지킨다.
- **각오 캐시는 피드와 분리**(`story-pledges` 태그 · `get_team_pledges` RPC): 각오 한 건이 큰 피드
  (`get_team_story_feed`, CTE 10개+) 캐시를 끌고 내려가지 않게 record_flex와 같이 떼어 뒀다.
  꽂으면 `pldg_mst` Realtime 구독으로 열린 모든 화면이 함께 갱신된다(알림·댓글과 같은 패턴).
- **폴라로이드는 2x2**: 3x3(9칸)은 375px에서 칸당 ~105px이라 사진 아래 한마디가 안 들어간다.
  폴라로이드는 사진 아래 여백에 글이 있어야 폴라로이드고, 없으면 그냥 사진 격자다. 2x2면
  칸당 ~160px로 한마디가 두 줄까지 읽힌다. 한 면은 항상 고정 높이 — 마지막 면이 한 장이어도
  지면이 출렁이지 않게(리드 스와이프와 같은 판단).
- **기록 스와이프는 감기지 않는다**: 끝에서 더 밀어도 처음으로 돌아가지 않는다. 리드 배너는
  소식 순환이라 감기지만 여기는 시간순 목록이라, 끝이 있다는 걸 손으로 알 수 있어야 한다.
- **떠다니는 아바타 = 실시간 접속자(`FloatingAvatars`)**: 피드 얼굴이 아니라 **지금 /story를 보고 있는
  로그인 크루원**이다(Realtime **presence** — 열면 track, 나가면 사라짐). 비로그인도 이 하늘을 보되 자기
  아바타는 없다. 탭하면 통통 튀는데 그 **튕김(누구·방향·세기)은 broadcast로 모두에게** 전해져 같은 공을
  주고받고 서로 방해도 된다. 물리는 각자 화면이 돌려 위치는 조금씩 다르고(정밀 동기화 아님), 공이 바닥에
  **안착할 때 그 주인이 위치를 한 번 흘려보내**(pos broadcast) 느슨히 재정렬한다. presence·broadcast는
  DB 복제가 아니라 Realtime 메시징이라 마이그레이션이 없다(각오 팻말과 다른 점 — 저긴 `pldg_mst`
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
- **기록 자랑 캐시는 피드와 분리**(`story-posts` 태그): 자랑은 올린 즉시 보여야 하고 피드 본문은 5분이면
  충분하다. 한 태그로 묶으면 자랑 한 건이 피드 전체 캐시를 끌고 내려간다. RPC도 `get_team_posts`로
  갈라 뒀다 — `get_team_story_feed`는 이미 CTE 10개+라 존을 더 얹지 않는다.
- **사진**: `post-photos` 버킷(멤버별 폴더). 아바타(512 정사각 crop)와 달리 비율 유지·폭 1080 제한.
  업로드를 먼저 하고 INSERT를 나중에 하되, INSERT가 실패하면 올린 파일을 지운다(고아 방지).
- **리드 슬롯**: 종류당 **한 칸**이다. 신규 멤버가 넷이라고 네 칸을 쓰면 스와이프가 명단 낭독이 된다.
  가장 최근 1명(1건)을 대표로 크게, 나머지는 우측 레일(`w-12` + 세로 괘선)에 작게 — 빠지는 사람이 없게.
  자동 전환 5초, 손이 닿으면 10초 멈췄다 반응이 없으면 스스로 재개한다(영구 정지 금지).
- **기상대**: 크루 분위기를 **먼저 말하고 근거를 뒤에** 붙인다. 단어는 프로필 카드의 개인 컨디션과
  같은 4단계(`lib/team-weather.ts` ↔ `getActivityMood`) — 같은 척도임을 설명 없이 전달하기 위해서.
  판정은 이번 주를 직전 4주 평균과 견준 비율이다(크루 규모마다 절대값이 달라서).
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
