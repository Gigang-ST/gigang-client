# 전체 페이지 속도·효율 분석 — 2026-09-19

## 범위와 결론

`app/**/page.tsx` 55개(일반 30, 관리자 24, 개발용 1)의 페이지 구조와 import를 전수 검토하고 주요 데이터 조회·하위 컴포넌트를 심화 분석했다. 애플리케이션 코드는 변경하지 않았다.

가장 먼저 개선할 부분은 **관리자 링크의 과도한 자동 prefetch**, **전체 페이지의 2MB 폰트**, **프로젝트 누적 원장 전량 조회**, **대회 참가자 수 중복 조회**, **홈 이미지 썸네일**, **관리자 숨김 탭 선행 조회**다. 이미 적용된 캐시·병렬 조회를 다시 추가하는 것보다 전송량과 불필요한 작업을 줄이는 편이 유효하다.

아래 우선순위는 코드 구조·적용 범위에 따른 판단이며, 절감 시간이나 성능 향상률을 통제된 조건에서 산출한 결과는 아니다. DB 실행계획과 운영 행수는 Supabase MCP가 없어 확인하지 못했다. 최초 분석 뒤 로그인·관리자 핵심 화면은 실제 계정으로 탐색 측정했으며 그 결과와 한계를 아래에 별도로 기록했다. 설치된 Next.js는 16.1.6이고 요구된 `node_modules/next/dist/docs/`는 존재하지 않았다. 공식 문서를 보완 참조했으며 최신 문서와 설치 버전의 차이를 구현 전에 확인해야 한다. 빌드·테스트 실행이나 운영 데이터 변경은 하지 않았다.

## 브라우저 관찰

Chrome DevTools MCP로 운영 홈 `https://gigang.team/`를 비로그인 상태에서 확인했다.

| 조건 | TTFB | LCP | CLS | 해석 |
|---|---:|---:|---:|---|
| 방문 후 재로드, CPU 1배, 네트워크 제한 없음 | 약 15ms | 341ms | 0.020 | 캐시가 있는 재방문 참고값 |
| 390×844, DPR 3, CPU 4배 지연, Fast 4G | 약 173ms | 724ms | 0.015 | 캐시 무시 재로드를 요청했으나 폰트 transferSize=0으로 캐시 잔존 확인 |

두 번째 측정에서 load 이벤트는 약 4.55초였으며 동일 출처 리소스 encodedBodySize 합계는 약 2.87MB, transferSize 합계는 약 0.79MB였다. **신규 방문 다운로드량이나 모든 페이지의 성능 점수로 해석하면 안 된다.** 외부 이미지의 바이트는 Resource Timing 접근 제한 때문에 합계에 포함하지 않았다. 사용자 상호작용을 측정하지 않아 INP 결과는 없다. 최초 LCP는 로딩 로고일 가능성도 있어 실제 피드가 준비되는 시간은 별도 측정해야 한다. CrUX 실사용자 데이터도 trace에서 제공되지 않았다.

운영 페이지의 폰트 리소스 2,057,688바이트는 로컬 Pretendard 파일 크기와 일치했다. 홈 사진은 표시 폭 158~180px에 자연 폭 759~1080px인 사례가 관찰됐다. 고해상도 화면을 고려해도 크기별 파생 이미지 검토 가치가 있다. 운영 배포와 로컬 checkout이 동일 커밋인지는 확인하지 않았다.

### 로그인 세션 추가 관찰

사용자가 브라우저에서 직접 로그인한 뒤 운영 화면을 추가 측정했다. 아래 값은 각 경로 1회, `/profile`만 2회 관찰한 탐색 결과다. 브라우저 캐시·서버 콜드 스타트·네트워크 변동을 통제한 벤치마크가 아니므로 절대 점수나 p50으로 사용하지 않는다.

| 경로 | 관찰값 | 실제 확인된 요청/현상 |
|---|---|---|
| `/races` | LCP 1.59초, 문서 load 1.60초 | 초기 참가자 수가 보인 뒤에도 `team_comp_plan_rel` 집계 재요청. `auth/user → mem_mst → comp_reg_rel` 개인화 연쇄 확인 |
| `/projects` | LCP 2.27초, DCL 4.67초, CLS 0.104, long task 합계 418ms | 차트 hydration 후 참가자→활동/목표 조회가 약 5.1초 시점에 시작. 설정 링크 RSC prefetch 6건도 발생 |
| `/profile` | LCP 10.18초/2.25초, responseEnd 10.07초/1.59초 | 두 진입의 편차가 매우 큼. 첫 진입 RSC 약 8.2초 및 알림 API 약 5.6초, 두 번째는 각각 약 1.79초/1.31초. 콜드 스타트·DB 변동을 분리할 반복 측정 필요 |
| `/admin` | LCP 0.92초, load 0.79초 | 통계용 서버 액션 POST 1건 외에 하위 메뉴 자동 prefetch로 fetch 47건. 관련 RSC/청크 45개, encoded 약 40KB, transfer 약 54KB 관찰 |
| `/admin/system/titles` | LCP 0.93초, DOM 4,326개, long task 합계 434ms | 첫 탭만 보이는데 `effect_mst`, `team_mem_rel`, `mem_ttl_rel`, 관계가 임베딩된 `ttl_mst` 4건 모두 즉시 요청 |
| `/admin/dues/inbox` | LCP 2.87초, responseEnd 2.42초 | 처리 대상 0건인데 처리 완료 142건을 초기 응답에 포함. 회비 메뉴 자동 prefetch도 14건 이상 발생 |

로그인 측정으로 `/races` 중복 조회와 칭호 숨김 탭 문제는 추정이 아니라 운영 동작으로 확인됐다. `/projects`의 서버 내부 누적 원장 페이지 수는 브라우저에서 보이지 않으므로 서버 계측이 여전히 필요하다. `/profile`은 두 번의 편차가 4배 이상이라 특정 쿼리를 원인으로 단정하지 않고, 운영 로그 또는 서버 timing을 붙인 3회 이상 반복 측정이 필요하다.

## 개선 후보

### A. 공통 리소스 — 우선 적용

- **전체 페이지 Pretendard 약 2.06MB**: `app/layout.tsx:94`에서 전체 variable 폰트 한 파일을 루트에 로드한다. 한글 unicode-range 분할 서브셋 또는 사용 글리프·웨이트에 맞춘 서빙을 검토한다. 동적 회원명·게시글의 한글 누락이 없도록 폴백을 검증한다. `display: swap`은 이미 적용되어 있다. preload 제거만으로 해결하려 하지 말고 실제 최초 화면 글꼴·네트워크 경쟁을 비교한다.
- **탭바 아이콘 269,231바이트**: `components/bottom-tab-bar.tsx:22`의 CSS mask가 `public/logo-mark.png` 전체를 받는다. 실제 아이콘 크기에 맞춘 투명 래스터 또는 기존 로고의 벡터 자산으로 교체하면 반복 적용 범위가 넓고 작업 위험이 낮다.
- **아바타 원본 서빙**: `components/common/avatar.tsx:131` 부근의 `unoptimized` 때문에 24~96px UI도 원본 URL을 받는다. 래스터 프로필 사진은 크기별 변환/썸네일을 사용하고 DiceBear SVG 폴백은 별도로 유지한다. 외부 OAuth 이미지의 접근 제약·실패 폴백을 유지해야 한다. 실제 이미지별 전송량 확인 후 우선순위를 조정한다.

### B. 프로젝트 — 우선 적용, 성능과 정확성 동시 개선

- `lib/queries/project-data.ts:119`는 누적 활동 원장을 모두 읽고 `:23`의 반복문에서 1,000행씩 순차 요청한다. 후기·종목·배율 등도 가져오지만 `components/projects/refund-status.tsx:56`, `crew-monthly-stats.tsx:79`는 주로 회원·월별 `final_mlg` 합계를 사용한다.
- 최신 월별 합계를 반환하는 집계 RPC로 전환하고 상세 기록은 필요한 월/회원에만 조회한다. 기존 월 스냅샷을 활용하려면 원장과 동일한 계산 의미·갱신 시점을 검증해야 한다. **환급액에 요청 간 캐시를 추가하는 제안이 아니다.** 현재 최신성 정책을 보존하면서 반환 행수와 왕복을 줄인다.
- 같은 파일 `:91` 당월 로그에는 페이지네이션이 없다. 운영 API 상한이 1,000행이면 월 기록이 이를 넘을 때 통계·목록이 잘릴 수 있다. 현재 운영 상한과 실제 누락 여부는 미확인이다. 단순 전체 페이지네이션보다 집계/상세 조회 분리가 바람직하다.
- `/projects/records`의 `app/(info)/projects/records/page.tsx:27`은 이벤트→참가 관계를 직렬 조회한다. `/projects`에서 사용하는 임베딩 패턴으로 왕복 하나를 줄일 수 있다. 페이지 내부 Suspense는 앞선 조회를 스트리밍하지 못하지만 상위 loading UI는 존재한다.
- `crew-monthly-stats.tsx:97`의 회원별 반복 filter는 Map 사전 집계로 줄일 수 있다. DB 전송량 개선보다 후순위다.

### C. 대회 — 우선 적용

- `app/(main)/races/page.tsx:99`에서 집계를 읽고 initialRegCounts를 전달하지만 `components/races/race-list-view.tsx:280`에서 마운트 직후 동일 ID 집계를 다시 읽는다. 초기값을 재사용하고 확장 목록의 새 ID 및 변경된 대회만 갱신한다.
- `race-list-view.tsx:229` 개인화는 hydration→auth.getUser→회원 조회→개인 참가 조회로 이어진다. 공개 목록 캐시는 유지하면서 개인화 데이터만 서버 스트리밍하거나 조회를 결합한다. 사용자별 응답을 공용 캐시에 섞지 않는다.

### C-2. 일정 — 병목 확정이 먼저

- 정적 분석 범위에서 `/schedule`의 캘린더 조회는 `getCachedHomeCalendar`·`getCachedCmmCdRows`가
  이미 캐시 + `Promise.all` 병렬이고, 헤더/본문이 각각 Suspense로 분리되어 있다. **이 문서는 이
  탭에서 고우선 병목을 찾지 못했다** — 성능이 실측으로 검증됐다는 뜻이 아니라, 정적 분석으로는
  후보가 나오지 않았다는 뜻이다.
- **헤더 티커 개인화 조회**: `app/(main)/schedule/page.tsx:28` 부근에서 로그인 회원마다
  `gthr_mst` + `gthr_attd_rel!inner` 조인으로 D-5 이내 내 모임 1건을 매 요청 조회한다.
  캐시된 캘린더 본문과 달리 개인화라 공개 캐시를 타지 못한다. 결과는 1행이고 헤더 Suspense가
  본문을 막지는 않지만, 이 탭에서 캐시를 타지 않는 유일한 조회라 실측 시 **가장 먼저 확인할
  후보**다. `stt_at` 범위와 `gthr_attd_rel.mem_id` 조인의 인덱스 사용 여부를 실행계획으로 본다.
- 공통 리소스(A: 폰트·탭바 로고·아바타)는 이 탭에도 그대로 걸린다. 일정 탭 체감이 느리다면
  탭 고유 문제인지 공통 리소스 때문인지부터 분리한다.
- 긴 목록 DOM은 후순위 판정을 유지한다.

### D. 홈·전광판 — 높은 적용 범위

- `components/story/story-lede.tsx:1362`, `record-flex-feed.tsx:526`에서 작은 타일에도 `unoptimized` 사진을 사용한다. `lib/image/post-photo-compress.ts:27`의 고화질 저장본은 공유·내보내기 용도로 보존하고 피드에는 크기별 파생본을 제공한다. 업로드 선압축은 이미 있으므로 무압축 원본 제공 문제로 오해하지 않는다.
- `lib/queries/story-feed.ts:241`은 캐시 갱신마다 팀 응원 원장 전체를 받아 JS로 합산한다. `:278` 개인 응원도 표시 항목과 무관하게 과거 전체를 읽는다. DB 집계와 표시 엔티티 범위 제한을 검토한다. 현재 30초 집계 캐시와 개인 데이터 분리는 유지한다. 행수 증가 시 비용·응답 상한 문제를 함께 검증한다.
- `app/(main)/story/page.tsx:89`의 여러 조회는 이미 병렬이지만 하나의 Promise.all이 피드 전체를 기다리게 한다. 느린 쿼리 실측 후 독립적인 아래쪽 섹션의 Suspense 분리를 검토한다. 현재 전체가 느리다는 측정 근거는 없다.

### E. 클라이언트 번들 — 중간 우선

- 닫힌 폼·다이얼로그가 정적 import된다: `components/profile/profile-tab-card.tsx:9`, `components/races/race-list-view.tsx:30`, `components/story/record-flex-feed.tsx:22`, `components/projects/activity-log-fab.tsx:13`. 열 때만 마운트하는 dynamic 경계를 적용한다. dynamic 선언 후 항상 렌더하면 다운로드가 즉시 시작될 수 있으므로 조건부 마운트까지 포함한다. 번들 분석으로 실제 절감량을 확인한다.
- `/board/[id]`: `components/board/post-detail.tsx:6`의 client 컴포넌트가 Markdown 파서 3종을 가져와 본문을 렌더한다. 본문은 서버에서 렌더하고 읽음 처리·편집 버튼만 client로 분리한다.
- 긴 목록의 windowing은 데이터가 수백 행 쌓이는 사용 사례에서 검토한다. 게시판·알림·일정은 이미 첫 페이지 제한이 있어 첫 화면 개선의 최우선 과제는 아니다.

### F. 관리자 — 조회가 일어나는 시점과 범위

- **관리자 허브·회비 메뉴 자동 prefetch**: `app/(info)/admin/page.tsx:119`, `:166`과 `app/(info)/admin/dues/layout.tsx:14`의 기본 `<Link>`가 화면에 보이는 여러 동적 관리 경로를 동시에 prefetch한다. `/admin` 한 번에 fetch 47건, 회비 인박스에서 하위 경로 prefetch 14건 이상을 관찰했다. 관리 화면은 이동 빈도보다 각 경로의 데이터 비용이 크므로 이 메뉴 링크는 `prefetch={false}`로 먼저 비교한다. 클릭 후 대기 증가와 서버 호출 감소를 함께 측정한다.
- **숨김 탭 조회**: `app/(info)/admin/system/titles/admin-titles-page-client.tsx:43`은 3개 탭을 CSS hidden으로만 처리하여 효과·이력 탭도 처음부터 마운트된다. 첫 방문 시 마운트하고 이후 상태를 보존한다. `admin-titles-client.tsx:163`의 수여 관계 전량 조회 후 카운트도 집계 RPC로 줄인다.
- **인박스 직렬 조회**: `lib/queries/dues.ts:46`부터 팀회원→회원→별칭→거래가 직렬이다. 회원 임베딩 및 독립 조회 병렬화로 대기 단계를 줄인다. 상위 페이지의 네 조회는 이미 병렬이므로 내부 체인이 대상이다. `:498`의 원장 정책 조회도 회원/잔액 체인과 병렬화 가능하다.
- **대회 상세 직렬 조회**: `app/(info)/admin/competitions/admin-competitions-client.tsx:227`의 계획→참가자→회원→종목 흐름에서 마지막 두 조회를 병렬화하거나 관계 조회로 합친다.
- **첫 목록이 hydration 이후 시작**: `/admin`, members, competitions, records, approvals, mileage, gatherings는 초기 effect에서 데이터를 받는다. 서버 wrapper에서 첫 결과를 전달하면 JS 로드 뒤에 시작하는 대기를 줄일 수 있다. 기존 필터·낙관적 업데이트는 client에 유지한다.
- **통계 원장 전량 조회**: `app/actions/admin/get-participation-stats.ts:78`은 원시 참석·신청·기록을 TS에서 합산한다. 기간별 통계와 전체기간 마지막 참여 정보를 구분해 DB 집계한다. 기록 조회의 팀 범위도 점검한다. 실행계획·행수 확인 후 적용한다.
- **회비 프로젝트**: `lib/queries/dues.ts:241` 합계를 전체 거래로 계산하고 `:313` 상세 거래 목록은 무제한이다. 합계는 DB 집계, 상세는 기간/커서로 제한한다. 면제 이력도 페이지네이션 검토 대상이다.
- **대회·회원·마일리지 전체 목록**: 실제 행수가 커지면 서버 검색·필터·기간·커서로 전환한다. 작은 코드 목록까지 일괄 페이지네이션할 필요는 없다.
- **후순위**: 인박스 처리됨 200건은 탭 진입 때 조회, 입금자 매칭은 회원·별칭 Map 재사용, 알림 발송 이력은 500행을 받은 뒤 20개 배치로 자르기보다 DB에서 최근 배치를 먼저 선정한다.

## 전체 페이지별 판정

공통 폰트·아바타·전역 리소스 항목은 아래 모든 해당 화면에 별도로 적용된다. ‘추가 병목 미확인’은 성능이 실측 검증되었다는 의미가 아니다.

| 경로 | 주요 분석 결과 |
|---|---|
| `/` | 홈은 story 재사용. 이미지·응원 집계·폼 번들, B/D/E 참고 |
| `/story` | 홈과 동일, D/E |
| `/schedule` | 캘린더 캐시·상세 dynamic 양호. 헤더 티커 개인화 조회 실측 필요, C-2. 긴 목록 DOM 후순위 |
| `/races` | 초기 집계 재조회·개인화 직렬 조회·폼 번들, C/E |
| `/records` | 공개 랭킹 캐시·팝업 dynamic 양호, 추가 고우선 병목 미확인 |
| `/projects` | 원장 전량/월별 상한, 집계 분리, B |
| `/projects/records` | 이벤트/참가 조회 결합, B |
| `/profile` | 편집 dialog 지연 로딩, E |
| `/profile/edit` | 역 검색 목록 지연 로딩 적용, 추가 병목 미확인 |
| `/profile/bank` | 작은 계정 폼, 추가 고우선 병목 미확인 |
| `/profile/dues` | 본인 회비 조회, 추가 고우선 병목 미확인 |
| `/profile/feedback` | 작성 폼, 추가 고우선 병목 미확인 |
| `/board` | 캐시·페이지 제한 양호, 누적 DOM 후순위 |
| `/board/[id]` | Markdown 서버 렌더 분리, E |
| `/board/write` | 편집기 dynamic 적용 |
| `/board/[id]/edit` | 편집기 dynamic 적용 |
| `/notifications` | 페이지 제한·전역 store 양호, 누적 DOM 후순위 |
| `/settings` | 상태 점 조회 병렬, 추가 고우선 병목 미확인 |
| `/mcp-tokens` | 서버 초기 조회, 추가 고우선 병목 미확인 |
| `/gatherings/[id]` | 상세 조회·폼 구조 검토, 추가 고우선 병목 미확인 |
| `/gatherings/new` | 작성 폼 구조 검토, 추가 고우선 병목 미확인 |
| `/newbie` | 정적 안내, 공통 리소스 개선 우선 |
| `/auth/login` | 로그인 화면, 공통 리소스 개선 우선 |
| `/auth/error` | 작은 오류 화면, 공통 리소스 개선 우선 |
| `/onboarding` | 단계별 폼·역 데이터 lazy 적용. 후반 모임 조회 분리는 측정 후 검토 |
| `/join` | 정적 안내, 공통 리소스 개선 우선 |
| `/policy` | 정적 안내, 공통 리소스 개선 우선 |
| `/privacy` | 정적 안내, 공통 리소스 개선 우선 |
| `/terms` | 정적 안내, 공통 리소스 개선 우선 |
| `/rules` | 정적 안내, 공통 리소스 개선 우선 |
| `/admin` | 초기 통계 서버 전달 검토. count 쿼리는 이미 병렬 |
| `/admin/approvals` | 초기 client fetch 개선 검토 |
| `/admin/competitions` | 초기 client fetch·전체 목록·상세 직렬 조회 |
| `/admin/dues` | 원장 조회 내부 병렬화. 잔액 스냅샷 사용은 양호 |
| `/admin/dues/excluded` | 리다이렉트, 독립 화면 병목 없음 |
| `/admin/dues/exemptions` | 전체 면제 이력 범위/페이지네이션 |
| `/admin/dues/expenses` | 리다이렉트, 독립 화면 병목 없음 |
| `/admin/dues/inbox` | 내부 직렬 조회·처리됨 탭 지연·매칭 사전 계산 |
| `/admin/dues/members` | 리다이렉트, 독립 화면 병목 없음 |
| `/admin/dues/members/[memId]` | 6개 조회 병렬·이력 제한 양호 |
| `/admin/dues/policy` | 서버 조회 병렬, 추가 고우선 병목 미확인 |
| `/admin/dues/projects` | 거래 원장 대신 DB 집계 |
| `/admin/dues/projects/[prjId]` | 거래 상세 페이지네이션 |
| `/admin/dues/transactions` | 리다이렉트, 독립 화면 병목 없음 |
| `/admin/feedback` | 100건 상한 존재, 과거 탐색 시 커서 검토 |
| `/admin/gatherings` | 초기 client fetch 개선 검토. 월별 필터·count 양호 |
| `/admin/members` | 전체 목록·참여 통계 DB 집계·초기 데이터 전달 |
| `/admin/mileage` | 전체 목록·초기 client fetch |
| `/admin/notifications` | 발송 배치 단위 조회/집계 |
| `/admin/records` | 초기 client fetch, 200건 상한 존재 |
| `/admin/system/batch` | 펼칠 때 이력 조회·Map 캐시 양호 |
| `/admin/system/common-codes` | placeholder, 독립 병목 없음 |
| `/admin/system/titles` | 숨김 탭 선조회·수여 관계 전량 집계 |
| `/admin/utmb-refresh` | 운영 도구, 추가 고우선 초기 화면 병목 미확인 |
| `/dev/story-styles` | 개발 전용 목업 비교, 운영 우선순위 제외 |

## 유지해야 할 기존 최적화

- `getCurrentMember()` 요청 내 React cache와 getClaims, 멤버/팀 관계 임베딩 조회.
- 홈 캘린더·게시판·랭킹 공개 캐시, 조회 병렬화.
- 알림/presence 채널의 루트 유지로 화면 이동마다 재구독하지 않음.
- presence는 매 프레임 React state 대신 ref/DOM transform 사용, 그리지 않는 화면에서 rAF 중단. 화면 장식을 근거 없이 주된 병목으로 단정하지 않는다.
- 프로젝트 공유 데이터의 요청 내 cache, 차트 dynamic, 섹션별 Suspense.
- 알림·게시판 목록 제한, 역 검색 지연 로딩, 회비 잔액 스냅샷.

## 실행 순서와 검증 기준

**순서 기준은 "일정 탭·홈 탭 우선"이다.** 아래 순서는 작업 난이도가 아니라 사용자가 먼저
체감하는 화면을 기준으로 배열했다. 작업 단위의 정본 목록과 진행 상태는
[성능 개선 진행 현황](./performance-optimization-progress.md)이며, 이 절과 어긋나면 그쪽을 따른다.

1. **일정 탭**: 이 문서의 정적 분석에서는 `/schedule`의 캘린더 캐시(`getCachedHomeCalendar`)와
   공통 코드 조회가 이미 병렬·캐시라 별도 고우선 병목을 찾지 못했다. 따라서 먼저 할 일은
   수정이 아니라 **병목 확정**이다. 로그인 상태 실측으로 최초 표시·월 이동 비용을 측정하고,
   아래 헤더 티커 조회부터 확인한다. 체감 지연이 공통 리소스(2번) 때문인지 이 탭 고유
   문제인지 분리하는 것이 완료 조건이다.
2. **홈·전광판**: D 섹션(피드 사진 `unoptimized`, 응원 원장 전량 합산)과 A 섹션 공통 리소스가
   여기서 겹쳐 효과가 가장 크다. 폰트·탭바 로고·아바타는 전 페이지 공통이라 1번 일정 탭에도
   그대로 반영된다. 진짜 빈 캐시 모바일 3회 이상 측정, 폰트 누락/레이아웃 이동 확인.
3. **대회·프로젝트**: 대회 초기 집계 재조회 제거와 개인화 waterfall 축소(C), 프로젝트 원장
   집계 분리(B). 1,000행 초과 데이터, 월말/KST 경계, 기존 원장 합계와 환급 결과 일치 확인.
   실행계획·반환 행수·쿼리 시간을 함께 비교.
4. **클라이언트 번들**: 닫힌 폼 dynamic, 게시글 Markdown 서버 렌더(E). 번들 분석으로 실제
   절감량과 첫 오픈 지연을 함께 본다.
5. **관리자**: F 섹션 전체(메뉴 prefetch 비활성화 비교, 칭호 숨김 탭 지연 마운트, 인박스·대회
   상세 직렬 조회, 통계 DB 집계, 첫 목록 서버 전달). 작업 자체는 작고 확실하지만 **이용자 수와
   진입 빈도가 일반 화면보다 훨씬 적어 후순위다.** 일반 사용자 화면이 끝난 뒤 세부 항목을
   재정렬한다.
6. **후속 계측**: 경로별 LCP/INP/CLS 및 실제 피드 준비 시간, 서버 쿼리 지연 p50/p95 기록.
   자동 테스트로 DOM 개수만 고정하기보다 사용자 대기와 DB 전송량을 검증한다.

멀티팀 확장 시 `app/api/revalidate/route.ts:22`의 전역 태그를 팀별 태그로 좁히는 것도 유효하다. 현재 단일팀 사용량에서는 위 항목보다 후순위다.

참조: [Next.js 폰트 API](https://nextjs.org/docs/app/api-reference/components/font), [Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading), [Caching](https://nextjs.org/docs/app/getting-started/caching). 폰트 로딩·조건부 지연 로딩·공개 캐시와 개인 데이터 분리의 구현 기준을 보완 확인했다.
