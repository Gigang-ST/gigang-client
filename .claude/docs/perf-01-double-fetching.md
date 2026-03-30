# 성능 개선 #1: 서버-클라이언트 이중 데이터 페칭 제거

## 문제 원인

Next.js App Router에서 서버 컴포넌트(페이지)가 Supabase로부터 데이터를 가져온 뒤,
그 데이터를 `"use client"` 컴포넌트에 props로 전달한다.
그런데 클라이언트 컴포넌트가 mount 되면서 `useEffect`로 **같은 종류의 데이터를 다시 조회**한다.

"mount"란 React 컴포넌트가 브라우저 DOM에 처음 나타나는 순간을 뜻한다.
`useEffect(() => { ... }, [])` 같은 코드는 mount 직후에 실행된다.

즉, 사용자가 화면을 볼 때까지의 흐름이 이렇게 된다:

```
[서버]
  1. 서버 컴포넌트 실행
  2. Supabase에서 데이터 조회 (getUser, member, registration 등)
  3. 조회 결과로 HTML 렌더링
  4. HTML + JS를 브라우저로 전송

[브라우저]
  5. HTML 표시 (이 시점에 화면은 보이지만 인터랙션 불가)
  6. React JS 로드 + 하이드레이션 (버튼 클릭 등 가능해짐)
  7. useEffect 실행 → Supabase에 같은 종류의 데이터 다시 요청  ← 이중 페칭
  8. 응답 대기
  9. state 업데이트 → 리렌더
```

서버에서 이미 완료한 인증/멤버/등록 조회를 브라우저에서 한 번 더 하는 것이 핵심 문제이다.

---

## 왜 문제인가

### 1. 체감 속도가 느려진다

Supabase 네트워크 왕복(round trip)은 1회당 약 80~200ms 소요된다.
클라이언트 useEffect에서 `getUser() → member 조회 → registration 조회`처럼
순차 체인이 걸리면 **300~600ms가 추가**된다.

서버 렌더링 시간 + 하이드레이션 시간 + 클라이언트 재조회 시간을 합하면
사용자가 "화면이 완전히 준비됐다"고 느끼기까지 **1초 이상**이 걸릴 수 있다.

### 2. 데이터량과 무관하게 느리다

테이블이 10개 미만이고 row가 수백 건이어도,
**왕복 횟수가 많으면** 네트워크 지연이 누적되어 느려진다.
DB 쿼리 자체는 1~5ms에 끝나지만, 네트워크 왕복이 80~200ms이기 때문이다.

### 3. 불필요한 리소스 소비

같은 데이터를 두 번 조회하면 Supabase API 호출 횟수가 2배가 된다.
무료 플랜의 API 호출 제한에도 불리하다.

---

## 개선 방법 (원칙)

**"첫 화면에 필요한 데이터는 서버에서 1번만 가져와 props로 내린다."**

- 서버 컴포넌트(페이지)에서 `memberStatus`, `registrationsByCompetitionId` 등을 계산
- 클라이언트 컴포넌트에 props로 전달
- 클라이언트의 초기 조회 `useEffect` 제거
- 클라이언트는 사용자 액션(참가 신청/수정/취소) 때만 Supabase 호출

### 서버에서 하기 좋은 것
- 인증 확인 (`getUser`)
- 멤버 조회
- 대회 목록/등록 정보 등 첫 화면 표시용 데이터

### 클라이언트에서 남겨야 하는 것
- 모달/다이얼로그 열림/닫힘 상태
- 참가 신청/수정/취소 API 호출 및 로컬 state 즉시 반영
- 키보드/스크롤/포커스 등 브라우저 전용 동작

---

## 예상 개선 효과

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| 홈 탭 클라이언트 네트워크 요청 | getUser + member + registration (3회, 순차) | 0회 |
| 대회 탭 클라이언트 네트워크 요청 | getUser + member + registration + regCount (4회, 순차) | 0회 (초기) |
| 첫 화면 준비까지 추가 대기 | ~300~600ms | ~0ms |
| Supabase API 호출 횟수 | 페이지 진입마다 중복 발생 | 서버 1회로 통합 |

---

## 문제가 있는 소스코드 목록

### (A) 홈 탭: `UpcomingRaces`

- **서버**: `app/(main)/page.tsx` → `HomeContent()`
- **클라이언트**: `components/home/upcoming-races.tsx`

#### 서버에서 이미 하는 일 (page.tsx)

```
getUser() → member 조회 → myRaces(competition_registration) 조회
→ upcomingCards 배열 생성 → <UpcomingRaces races={upcomingCards} /> 으로 전달
```

#### 클라이언트에서 또 하는 일 (upcoming-races.tsx)

```
useEffect #1 (43~59줄):
  supabase.auth.getUser()      ← 서버에서 이미 했음
  → member 조회               ← 서버에서 이미 했음
  → setMemberStatus

useEffect #2 (62~78줄):
  memberStatus가 ready되면
  → competition_registration 조회  ← 서버에서 이미 비슷한 조회 완료
  → setRegistrationsByCompetitionId
```

#### 개선 방향

1. `page.tsx`(서버)에서 `memberStatus`와 `registrationsByCompetitionId`까지 계산
2. `UpcomingRaces`의 props에 `initialMemberStatus`, `initialRegistrations` 추가
3. `UpcomingRaces`에서 useEffect #1, #2 제거
4. 초기값은 props에서 받고, 신청/수정/취소 시에만 로컬 state 갱신

---

### (B) 대회 탭: `RaceListView`

- **서버**: `app/(main)/races/page.tsx` → `RacesContent()`
- **클라이언트**: `components/races/race-list-view.tsx`

#### 서버에서 이미 하는 일 (races/page.tsx)

```
Promise.all([getUpcomingCompetitions(), getGigangCompetitions()])
→ <RaceListView allCompetitions={...} gigangCompetitions={...} />
```

대회 목록은 서버에서 전달하지만, 인증/등록 정보는 전달하지 않음.
(races/page.tsx는 anon 클라이언트 + unstable_cache를 써서 인증 없이 대회만 조회)

#### 클라이언트에서 하는 일 (race-list-view.tsx)

```
useEffect #1 (86~102줄):
  supabase.auth.getUser()    ← 네트워크 요청 (100~200ms)
  → member 조회              ← 네트워크 요청 (100~200ms)
  → setMemberStatus

useEffect #2 (111~130줄):
  memberStatus가 ready되면
  → competition_registration 조회 (내 등록 목록)
  → setRegistrationsByCompetitionId

useEffect #3 (150~165줄):
  → competition_registration 전체 조회 (대회별 참가 인원 수)
  → setRegCounts
```

이 구조에서 races/page.tsx 서버는 인증을 안 하므로 엄밀히 "이중 페칭"은 아니다.
하지만 **서버에서 인증 + 등록 정보도 같이 가져와 props로 내리면**
클라이언트의 3개 useEffect를 전부 없앨 수 있다.

#### 개선 방향

1. `races/page.tsx`(서버)에서 인증된 Supabase 클라이언트로 `memberStatus`, `registrationsByCompetitionId`, `regCounts` 조회
2. `RaceListView`의 props에 위 초기값 추가
3. useEffect #1, #2, #3 제거
4. 참가 신청/수정/취소 시에만 로컬 state 갱신

주의: 현재 races/page.tsx는 anon 클라이언트 + unstable_cache로 대회 목록을 캐싱 중.
인증된 클라이언트를 쓰려면 캐싱 구조 조정이 필요할 수 있음.
방법: 대회 목록(공개)은 기존 unstable_cache 유지, 인증/등록 정보는 별도 조회 후 합치기.

---

## 관련 패턴: 클라이언트 전용 페칭 (서버 조회 없이 mount 시 클라에서만 조회)

아래는 "서버가 데이터를 안 보내고, 처음부터 클라에서만 조회"하는 페이지들이다.
서버↔클라 이중 페칭은 아니지만, **같은 원리로 느려지는 구조**이다.

### 왜 이것도 문제인가

이중 페칭(A, B)은 "서버가 이미 가져온 걸 클라가 또 가져오는" 문제였다면,
여기는 "서버가 아예 아무것도 안 가져오고, 클라가 mount 이후에야 처음 가져오는" 문제이다.

이 경우 사용자가 체감하는 흐름은:

```
1. 페이지 진입
2. 서버가 "빈 껍데기 HTML" (Skeleton 또는 빈 화면) 전송
3. 브라우저에서 JS 로드 + 하이드레이션
4. useEffect 실행 → getUser() 네트워크 요청 (100~200ms)
5. member 조회 네트워크 요청 (100~200ms)
6. 데이터 도착 → state 업데이트 → 실제 콘텐츠 렌더
```

즉, **4~6번 동안(200~400ms+) 사용자는 빈 화면 또는 스켈레톤만 본다.**
서버 컴포넌트로 전환하면 4~6번이 서버 쪽에서 일어나고,
HTML이 도착할 때 이미 데이터가 포함되어 있으므로 첫 페인트에 콘텐츠가 보인다.

### 개선 원칙

1. `"use client"`를 페이지 최상위에서 제거
2. 데이터 조회를 서버 컴포넌트(async 함수)로 올림
3. 조회 결과를 props로 클라이언트 컴포넌트에 전달
4. 클라이언트 컴포넌트는 상호작용(수정/삭제/상태변경)에만 집중

단, **폼 입력, 검색/필터, 모달 상태** 등 인터랙션이 있는 부분은 클라이언트에 남겨야 한다.
서버 컴포넌트 = 초기 데이터, 클라이언트 컴포넌트 = 상호작용 의 원칙은 동일하다.

---

### (C) 설정 페이지: `app/(info)/settings/page.tsx`

#### 현재 구조

페이지 전체가 `"use client"`. mount 시 admin 여부만 확인한다.

```
useEffect (55~72줄):
  supabase.auth.getUser()    ← 네트워크 요청
  → member.admin 조회        ← 네트워크 요청
  → setIsAdmin
```

나머지는 정적 링크 목록(`accountItems`, `adminItems`, `infoItems`)이라
데이터가 거의 없는데도 mount 이후에야 ADMIN 섹션 표시 여부가 결정된다.

#### 개선 방향

1. `"use client"` 제거, 서버 컴포넌트로 전환
2. 서버에서 `getUser()` + member.admin 조회
3. admin 여부를 서버에서 판단하여 ADMIN 섹션 포함/제외한 HTML 반환
4. 로그아웃 버튼만 별도 클라이언트 컴포넌트로 분리 (signOut은 브라우저에서 해야 함)

#### 예상 효과

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| mount 후 네트워크 요청 | getUser + member (2회 순차) | 0회 |
| ADMIN 섹션 표시까지 대기 | ~200~400ms | 즉시 (서버 렌더에 포함) |

---

### (D) 프로필 수정: `app/(info)/profile/edit/page.tsx`

#### 현재 구조

페이지 전체가 `"use client"`. mount 시 auth + 멤버 프로필 로딩.

```
useEffect (41~77줄):
  supabase.auth.getUser()    ← 네트워크 요청
  → 미인증이면 /auth/login 리다이렉트
  → member 조회 (full_name, gender, birthday, phone, email, avatar_url)
  → 미가입이면 /onboarding 리다이렉트
  → setProfile + setLoading(false)
```

프로필 데이터 로딩까지 전체가 Skeleton 상태.

#### 개선 방향

1. 페이지를 서버 컴포넌트로 전환
2. 서버에서 getUser + member 조회 → 미인증/미가입 시 redirect()
3. 조회된 profile 데이터를 클라이언트 컴포넌트(`ProfileEditForm`)에 props로 전달
4. 클라이언트는 폼 입력 상태 관리 + 저장 API 호출만 담당

#### 예상 효과

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| mount 후 네트워크 요청 | getUser + member (2회 순차) | 0회 |
| 폼 필드에 데이터 채워지기까지 | ~200~400ms (Skeleton) | 즉시 (서버 렌더에 포함) |
| 리다이렉트 | 클라이언트에서 router.push (깜빡임) | 서버에서 redirect (깜빡임 없음) |

---

### (E) 계좌 정보: `app/(info)/profile/bank/page.tsx`

#### 현재 구조

(D)와 거의 동일한 패턴. mount 시 auth + member(bank_name, bank_account) 조회.

```
useEffect (37~73줄):
  supabase.auth.getUser()    ← 네트워크 요청
  → member 조회 (id, full_name, bank_name, bank_account)
  → setData + setLoading(false)
```

#### 개선 방향

(D)와 동일. 서버에서 데이터 조회 → 클라이언트 `BankInfoForm`에 props 전달.

#### 예상 효과

(D)와 동일. mount 후 네트워크 2회 → 0회, 즉시 폼 표시.

---

### (F) 관리자 대시보드: `app/(info)/admin/page.tsx`

#### 현재 구조

mount 시 서버 액션 `getAdminStats()` 호출.

```
useEffect (47~49줄):
  getAdminStats().then(setStats)
```

`getAdminStats`는 서버 액션이라 서버에서 실행되지만,
호출 자체가 **클라이언트 mount 이후**에 시작되므로 왕복 1회분 지연이 발생한다.

#### 개선 방향

1. 서버 컴포넌트로 전환
2. 서버에서 직접 stats 조회 (서버 액션 대신 서버 컴포넌트 내 직접 호출)
3. 조회 결과를 JSX에 직접 포함

#### 예상 효과

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| mount 후 네트워크 요청 | getAdminStats 1회 (서버 액션 왕복) | 0회 |
| 통계 숫자 표시까지 | Skeleton → 데이터 로드 후 표시 | 즉시 (HTML에 포함) |

---

### (G) 가입 승인: `app/(info)/admin/approvals/page.tsx`

#### 현재 구조

mount 시 pending 멤버 목록 조회.

```
useEffect → loadMembers() (22~31줄):
  supabase.from("member").select(...).eq("status", "pending")
```

#### 개선 방향

1. 서버 컴포넌트로 전환, pending 멤버를 서버에서 조회
2. 클라이언트 컴포넌트(`ApprovalsList`)에 initialMembers props 전달
3. 클라이언트는 승인/거절 액션 + 로컬 목록 갱신만 담당

#### 예상 효과

mount 후 네트워크 1회 → 0회. 첫 화면에 즉시 대기 멤버 표시.

---

### (H) 대회 관리: `app/(info)/admin/competitions/page.tsx`

#### 현재 구조

mount 시 전체 대회 목록 + 참가 인원수 조회.

```
useEffect → loadCompetitions() (88~114줄):
  supabase.from("competition").select("*, competition_registration(count)")
```

이 페이지는 목록 조회 + 생성/수정/삭제/상세 보기를 모두 하나의 `"use client"` 컴포넌트에서 처리한다.

#### 개선 방향

1. 서버 컴포넌트에서 대회 목록 조회
2. 클라이언트 컴포넌트에 initialCompetitions props 전달
3. 생성/수정/삭제 후 목록 갱신은 기존 방식 유지 (또는 서버 액션 + revalidate)

#### 예상 효과

mount 후 네트워크 1회 → 0회. 즉시 대회 목록 표시.

---

### (I) 회원 관리: `app/(info)/admin/members/page.tsx`

#### 현재 구조

mount 시 전체 멤버 목록 조회.

```
useEffect → loadMembers() (63~73줄):
  supabase.from("member").select("id, full_name, phone, email, gender, birthday, avatar_url, status, admin, joined_at")
```

#### 개선 방향

(H)와 동일 패턴. 서버에서 멤버 목록 조회 → 클라이언트에 props 전달.

#### 예상 효과

mount 후 네트워크 1회 → 0회. 즉시 멤버 목록 표시.

---

### (J) 기록 관리: `app/(info)/admin/records/page.tsx`

#### 현재 구조

mount 시 기록 목록 조회 (최대 200건).

```
useEffect → loadRecords() (55~66줄):
  supabase.from("race_result").select("id, event_type, record_time_sec, race_name, race_date, member:member_id(full_name)")
    .limit(200)
```

#### 개선 방향

(H), (I)와 동일 패턴. 서버에서 기록 조회 → 클라이언트에 props 전달.

#### 예상 효과

mount 후 네트워크 1회 → 0회. 즉시 기록 목록 표시.

---

## 전체 요약

### 이중 페칭 (서버에서 이미 가져온 데이터를 클라이언트가 또 조회)

| 대상 | mount 시 중복 요청 | 절감 시간 |
|------|-------------------|-----------|
| (A) UpcomingRaces (홈 탭) | 3회 순차 (getUser + member + registration) | ~300~600ms |
| (B) RaceListView (대회 탭) | 4회 순차 (getUser + member + registration + regCount) | ~400~800ms |

### 클라이언트 전용 페칭 (서버 조회 없이 mount 시 클라에서만 조회)

| 대상 | mount 시 요청 | 절감 시간 |
|------|--------------|-----------|
| (C) 설정 | 2회 순차 (getUser + member.admin) | ~200~400ms |
| (D) 프로필 수정 | 2회 순차 (getUser + member 프로필) | ~200~400ms |
| (E) 계좌 정보 | 2회 순차 (getUser + member 계좌) | ~200~400ms |
| (F) 관리자 대시보드 | 1회 (getAdminStats 서버 액션) | ~100~200ms |
| (G) 가입 승인 | 1회 (pending member 조회) | ~100~200ms |
| (H) 대회 관리 | 1회 (competition + count 조회) | ~100~200ms |
| (I) 회원 관리 | 1회 (member 전체 조회) | ~100~200ms |
| (J) 기록 관리 | 1회 (race_result 조회) | ~100~200ms |

### 우선순위

1. **(A), (B)** — 메인 탭이라 모든 사용자가 매번 방문. 절감 효과 가장 큼.
2. **(C)** — 설정은 자주 방문하진 않지만 구조 개선이 간단함.
3. **(D), (E)** — 프로필 수정 시 체감 개선이 명확함.
4. **(F)~(J)** — 관리자만 접근하므로 우선순위 낮음. 단, 패턴이 동일하여 한 번에 작업 가능.
