# 캐시 함정 모음

`unstable_cache`, `revalidateTag`, ISR 등 Next.js 캐시 레이어에서 반복적으로 발견되는 함정과
미해결 개선 항목을 기록한다. 즉시 고칠 정도는 아니지만 시간 날 때 잡고 가야 하는 것들.

---

## 1. 트레일러닝 랭킹: 24시간 TTL + 갱신 의존 캐시가 빈 데이터로 굳을 수 있음

### 현상

- 운영 DB(`mem_utmb_prf`, `team_mem_rel`, `mem_mst`)에는 트레일 멤버 데이터가 정상 존재
- `get_public_team_utmb_rankings(team_id)` RPC 직접 호출도 정상 (10명 반환)
- 그런데 운영에서 `/records`의 트레일러닝 탭이 빈 상태로 보임
- 24시간 정도 지난 뒤 자연스럽게 정상화

### 위치

- `app/(main)/records/page.tsx:30-189` — `getCachedRecordsData(teamId)`
- `app/actions/admin/refresh-utmb-indexes.ts:143-145` — `revalidateTag` 호출

### 원인 추정 (재발 시나리오)

```ts
unstable_cache(fn, [`records-team-${teamId}`], {
  revalidate: 60 * 60 * 24,                         // 24시간 TTL
  tags: ["records", `records:${teamId}`],
})
```

1. 배포·revalidate 시점에 RPC가 일시적으로 빈/불완전 데이터를 반환
   (마이그레이션 직후·UTMB 프로필 이전 시점 등)
2. 그 빈 결과가 캐시에 24시간 동안 굳어버린다
3. 무효화 트리거는 **관리자가 UTMB 일괄 갱신 버튼을 눌렀고 `updated > 0`일 때뿐** (`refresh-utmb-indexes.ts:143`)
   - 운영자가 누르지 않으면 24시간 동안 빈 상태 유지
4. TTL 만료 후 다음 요청 시 정상화

### 개선 후보 (착수 시점 자유)

- **TTL 단축**: `revalidate: 60 * 60 * 24` → `60 * 60` (1시간) 정도. 운영 부담 거의 없으면서 빈 캐시가 굳는 창을 24배 줄임.
- **빈 결과 캐시 방지**: 트레일 entries가 0이면 캐시 저장 대신 short-TTL fallback 반환 (또는 unstable_cache 우회).
- **명시적 무효화 엔드포인트**: 운영 콘솔에 "트레일 랭킹 캐시 강제 리프레시" 버튼 추가 (`/api/revalidate?tag=records:<teamId>` 호출).
- **장기**: `unstable_cache`는 Next.js에서 deprecated 수순. `'use cache'` directive + `revalidateTag` 패턴으로 마이그레이션.

### 우회 (긴급 시)

운영자가 관리자 페이지의 **UTMB 인덱스 일괄 갱신** 버튼을 누르면 `summary.updated > 0`인 경우
`revalidateTag('records:<teamId>', 'max')`가 호출되어 즉시 캐시가 무효화된다.
`updated === 0`이면 무효화되지 않는 점 주의.

### 발견 컨텍스트

- 발견일: 2026-05-28
- 브랜치: `trail_ranking_fix`
- 관련 커밋: `508ffa0` (#232, UTMB 갱신 시 캐시 무효화 fix)
- 조사 중 운영에서 자체 정상화 → 코드 변경 없이 함정만 기록
