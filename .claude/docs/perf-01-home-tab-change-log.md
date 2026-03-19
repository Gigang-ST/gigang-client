# 홈탭 성능 개선 적용 내역 (1차)

## 목적

`app/(main)/page.tsx` + `components/home/upcoming-races.tsx`에서 발생하던
서버-클라이언트 이중 페칭을 제거해, 홈탭 진입 시 불필요한 추가 네트워크 요청을 줄인다.

---

## 변경 배경

기존 구조에서는 서버에서 홈 데이터(대회 카드)를 만든 뒤에도,
`UpcomingRaces`가 mount 되면서 아래를 다시 조회했다.

1. `supabase.auth.getUser()`
2. `member` 조회
3. `competition_registration` 조회(카드 대회 기준 내 등록)

즉, 홈탭 진입 시 서버 조회 + 클라이언트 재조회가 겹쳐 체감 로딩이 증가했다.

---

## 적용한 변경

## 1) 서버에서 초기 인증/등록 상태를 함께 계산

파일: `app/(main)/page.tsx`

- `MemberStatus`를 서버에서 계산해 `initialMemberStatus`로 생성
  - 비로그인: `signed-out`
  - 로그인 + 멤버 존재: `ready`
  - 로그인 + 멤버 미존재: `needs-onboarding`
- 내 등록 정보(`competition_registration`)를 서버에서 함께 조회
- 홈 카드(`upcomingCards`) 대상만 추려 `initialRegistrationsByCompetitionId` 맵 생성

## 2) 클라이언트의 mount 시 재조회 제거

파일: `components/home/upcoming-races.tsx`

- `useEffect` 2개 삭제
  - 멤버 로드 effect (`getUser` + `member`)
  - 내 등록 로드 effect (`competition_registration`)
- 새로운 props를 받아 초기 상태로 사용
  - `initialMemberStatus`
  - `initialRegistrationsByCompetitionId`

## 3) 인터랙션 동작은 기존 유지

아래 동작은 클라이언트에서 그대로 유지:

- 참가 신청(create)
- 신청 수정(update)
- 신청 취소(delete)

즉, **초기 조회만 서버로 이동**하고, **사용자 액션 후 상태 갱신은 기존 방식 유지**했다.

---

## 변경 파일

- `app/(main)/page.tsx`
- `components/home/upcoming-races.tsx`

---

## 기대 효과

- 홈탭 진입 시 클라이언트의 추가 인증/등록 조회 제거
- 네트워크 왕복 감소로 체감 로딩 개선
- 동일 데이터 중복 조회 제거로 Supabase 호출량 감소

---

## 주의/제약

- 이번 변경은 **홈탭 한정**이다.
- 대회탭(`RaceListView`)의 유사 패턴은 아직 미적용 상태.
- 캐시 전략(`unstable_cache`, prefetch, loading.tsx)은 이번 커밋 범위에 포함하지 않는다.

---

## 검증 포인트

1. 홈탭 진입 시 카드/다이얼로그 동작이 기존과 동일한지 확인
2. 로그인/비로그인/온보딩 전 상태에서 신청 버튼 동작이 정상인지 확인
3. 신청/수정/취소 후 카드 상세 다이얼로그 상태 반영이 정상인지 확인

