# 대회탭 성능 개선 적용 내역 (1차)

## 목적

`app/(main)/races/page.tsx`와 `components/races/race-list-view.tsx`에서
초기 진입 시 발생하던 클라이언트 mount 조회를 제거해 첫 로드 지연을 줄인다.

## 변경 내용

- `races/page.tsx`
  - 서버에서 `initialMemberStatus` 계산
  - 서버에서 초기 대회 목록 대상의
    - 내 등록 맵(`initialRegistrationsByCompetitionId`)
    - 참가 인원수 맵(`initialRegCounts`)
    를 함께 계산해 `RaceListView`로 전달

- `race-list-view.tsx`
  - 제거: mount 시 실행되던 `useEffect` 3개
    - 멤버 로드(`getUser` + `member`)
    - 내 등록 로드(`competition_registration`)
    - 대회별 참가 인원수 로드
  - 추가: 서버에서 전달받은 초기값으로 state 시작
  - 지난 대회 더보기 시점에는 추가된 대회 id에 대해서만 보조 메타(인원수/내등록) 조회

## 기대 효과

- 대회탭 첫 진입 시 클라이언트 초기 네트워크 왕복 감소
- 중복 auth/member/registration 조회 제거
- 대회 목록 렌더까지의 체감 시간 단축

## 변경 파일

- `app/(main)/races/page.tsx`
- `components/races/race-list-view.tsx`

