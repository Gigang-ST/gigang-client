# HG_TODOS — 칭호 시스템 구현 인계 메모

> 작성일: 2026-04-29
> 브랜치: `feature/title-system` (origin/dev에서 분기)
> 다른 PC에서 이어 작업하려면 이 파일과 아래 산출물을 따라가면 됨.

## 0. 컨텍스트 한 줄 요약

기존 설계서(`docs/design/2026-03-23-칭호시스템.md`)를 v2 멀티팀 스키마 규약(`.claude/docs/database-schema-v2*.md`)에 맞춰 재정리하고, **DB 마이그레이션까지** 작성 완료. 코드(서버 함수/UI)는 미착수.

## 1. 이번에 끝낸 것

### 설계 문서
- `.claude/docs/database-schema-v2-title-domain.md` (신규) — 칭호 도메인 v2 정식 설계서. ttl_mst / mem_ttl_rel / TTL_CTGR_CD / ttl_kind_enm / 자동 칭호 cond_rule jsonb 스키마 / 시드 카탈로그 / RLS / 재계산 정책 / 오픈 이슈 정리.
- `.claude/docs/database-schema-v2-domains.md` §5 — "팀 이벤트/칭호 도메인 (작성 보류)" 해제, 신규 문서 링크 + 관계 요약 4줄 추가.
- `.claude/docs/database-schema-v2.md` §6 — 멀티팀 소유 모델에 "칭호" 포함.

### 마이그레이션 (4개, dev 미적용 — 다음 PC에서 적용 필요)
| 파일 | 내용 |
|------|------|
| `supabase/migrations/20260429100000_cyc_evt_cd_mediofondo.sql` | `CYC_EVT_CD`에 `MEDIOFONDO` 추가 (sort_ord 재배치) |
| `supabase/migrations/20260429110000_ttl_codes_and_enum.sql` | `TTL_CTGR_CD` 코드그룹/5코드 + `ttl_kind_enm` enum |
| `supabase/migrations/20260429120000_ttl_mst_and_mem_ttl_rel.sql` | 두 테이블 + 인덱스 5개 + 트리거 + RLS 6개 정책 |
| `supabase/migrations/20260429130000_ttl_mst_seed_gigang.sql` | 기강 팀 자동 19종 + 수여 4종(서브현근/기강단장/행동대장/맛객) 시드 |

### 확정된 설계 결정
- **칭호 = 팀 스코프** (`ttl_mst.team_id`, `mem_ttl_rel.team_id`)
- **가입일 기준** = `team_mem_rel.join_dt` (글로벌 `joined_at` 도입 X)
- 자동 칭호 정의도 **팀별 행으로 시드** — 신규 팀 가입 시 19종 시드 RPC는 별도 작업
- **자동 재계산** = 서버 액션 동기 처리, DB 트리거 X
- **자동 칭호 포인트** = 동적 계산(저장 X), 수여 칭호만 `granted_pt` 저장
- **활성 회원** = `team_mem_rel.mem_st_cd='active' AND vers=0 AND del_yn=false`
- 트레일/울트라 구분 = `comp_mst.comp_sprt_cd` 조인 (별도 sport 컬럼 추가 X)
- `ttl_kind_enm` enum / `TTL_CTGR_CD` 공통코드
- 수여 칭호 동일 ttl_id는 정본 1건만, 재부여는 만료 후 재INSERT
- **포인트 동점 시 정렬**: `ttl_rank` 우선
- `cond_rule` 변경 시 보유자: 다음 재계산까지 유지 + 관리자 즉시 재계산 RPC 추가 예정
- **이름 이펙트**: Phase 3로 보류 (디자인팀 협업 후)

## 2. 다음 PC에서 가장 먼저 할 일

```bash
git fetch origin
git checkout feature/title-system
git pull
```

### 2-1. dev에 마이그레이션 적용 + 검증
1. Supabase MCP `apply_migration` 또는 `pnpm supabase db push --db-url <dev>` 로 4개 적용
2. `mcp__supabase-gigang-dev__list_tables` 로 `ttl_mst`, `mem_ttl_rel` 생성 확인
3. `pnpm supabase gen types typescript --project-id <dev>` 로 `lib/supabase/database.types.ts` 재생성
4. CHECK 제약 위반 케이스 손으로 INSERT 시도해서 동작 확인

### 2-2. 적용 시 발생 가능한 이슈 미리 체크
- `team_mst.team_cd='gigang'` 정본이 dev에도 있는지 확인 (시드 마이그레이션이 실패하면 여기 원인일 가능성 큼)
- `v2_rls_auth_in_team`, `v2_rls_auth_team_owner_or_admin` 함수가 dev에 존재하는지 확인 (`20260407120000` 기준)
- `set_v2_upd_at` 함수가 존재하는지 확인 (`20260404064718` 기준)

## 3. 남은 구현 (Phase 1)

### A. 서버 측 (백엔드 개발자 에이전트로 위임 가능)
1. **자동 칭호 재계산 함수** — `lib/queries/title.ts` (가칭)
   - `recomputeAutoTitles(teamId: string, memId: string): Promise<void>`
   - 4개 카테고리 각각에 대해 등급 9→1 평가, 첫 충족 등급 채택
   - 같은 (team_id, mem_id, category) 정본이 다른 ttl_id면 이력화 후 정본 교체
   - jsonb cond_rule 해석 헬퍼: `evaluateCondRule(rule, ctx)` — type별 분기 (join_age / pb / finish / finish_any)
   - join_age 평가 시 `team_mem_rel.join_dt` 사용
   - pb/finish/finish_any 평가 시 `rec_race_hist → comp_evt_cfg → comp_mst.comp_sprt_cd` 조인

2. **포인트 RPC** — `get_team_member_title_points(p_team_id uuid)` SQL function
   - 설계서 §7.1의 SQL을 함수로 래핑
   - 반환: `mem_id`, 카테고리별 칭호명/이모지/점수, 총 점수
   - SECURITY DEFINER + RLS 우회 (같은 팀 멤버만 호출 가능하게 wrapper에서 검증)

3. **즉시 재계산 RPC** — `recompute_team_member_titles(p_team_id, p_mem_id)`
   - admin이 칭호 정의 변경 후 호출
   - 내부에서 recomputeAutoTitles 동일 로직 (서버 함수와 일치 검증)

4. **기록 등록/수정/삭제 훅** — `rec_race_hist` 관련 서버 액션 (이미 존재) 끝부분에 `recomputeAutoTitles` 호출 추가
   - 검색: `app/(main)/records/` 또는 `lib/actions/race-result*` 등에서 insert/update/delete 코드

5. **회원 가입 시 런린이 부여** — 온보딩 완료 액션에 추가
   - `team_mem_rel` insert 직후 `recomputeAutoTitles` 호출 (런린이 자동 부여됨)

### B. 프론트엔드 (프론트엔드 개발자 에이전트로 위임 가능)
6. **타이포그래피 + 이모지 표시 컴포넌트** — `components/common/member-name-with-titles.tsx`
   - props: `memId`, `teamId` 또는 사전 fetch된 titles 배열
   - 이름 + 자동 칭호 이모지 + 수여 칭호 뱃지(이름)
   - 포인트 내림차순 정렬 (동점 시 ttl_rank 우선)

7. **프로필 페이지에 적용** — `app/(main)/profile/page.tsx` L69 부근
   - `getCurrentMember()` + 칭호 fetch → `MemberNameWithTitles` 적용

### Phase 2 (별도 PR 권장)
- 관리자 수여 UI (`/admin/titles`) — owner/admin이 수여 칭호 부여/만료 관리
- 랭킹/홈/대회 참가자 목록에 칭호 표시 확장

### Phase 3 (디자인팀 협업 후)
- 이름 이펙트 (러닝=폰트 스타일, 철인=둘레 장식, 트런=후광, 자전거/수여=디자인팀 정의)

## 4. 오픈 이슈 (구현 중 결정 필요)

설계서 §12에 정리. 현재까지 결정된 기본값은 위 §1 "확정된 설계 결정"에 반영.

남은 결정 항목:
- **신규 팀 시드 RPC**: 신규 팀 생성 시 자동 19종을 그대로 시드하는 RPC를 둘지, 운영자가 수동 등록하게 둘지. 멀티팀이 본격화되면 필요.
- **수여 칭호 base_pt 기본값**: 현재 0으로 시드. 운영자가 수여 시 직접 입력. 운영자 안내 UI 필요.
- **자동 재계산 실패 시 처리**: 기록 등록 트랜잭션 내에서 동기 실행할 때, 칭호 재계산이 실패하면 기록 저장도 롤백할지? — 권장: 별도 try/catch로 재계산 실패는 로그만 남기고 기록 저장은 성공시킴 (재시도 RPC로 복구).

## 5. 참고할 파일/문서

- 설계서: `docs/design/2026-03-23-칭호시스템.md` (제품 설계, 화면 표시 규칙 등 본 도메인 문서에 안 옮긴 부분)
- v2 도메인 설계서: `.claude/docs/database-schema-v2-title-domain.md`
- v2 규약: `.claude/docs/database-schema-v2.md`
- 약어 사전: `.claude/docs/database-abbreviation-dictionary.md`
- 기존 RLS 헬퍼 정의: `supabase/migrations/20260407120000_v2_team_mem_rel_rls_no_recursion.sql`
- 기존 코드그룹 시드 패턴: `supabase/migrations/20260407013000_comp_evt_type_and_sport_event_code_groups.sql`

## 6. 커밋 안 한 채로 이 파일을 보고 있다면

이 파일은 첫 커밋에 포함되어 푸시되어 있어야 정상. 만약 직접 작업 중인 PC에서 이걸 만들고 있다면, 푸시 전에 확인할 것:
- `git status` 로 4개 마이그레이션 + 2개 수정 문서 + 1개 신규 문서 + HG_TODOS.md 가 보여야 함
- 현재 브랜치가 `feature/title-system` 인지 확인
