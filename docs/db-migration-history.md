# DB 마이그레이션 이력 대조 (#713)

저장소 `supabase/migrations` 와 DB(prd·dev) 적용 목록(`supabase_migrations.schema_migrations`)이 1:1이 아니다. 대조 방법과 2026-11-20 시점 결과를 남긴다.

## 대조 방법

```bash
# 1) DB에서 적용 목록을 뽑는다 (조회만. 결과를 version<TAB>name TSV로 저장)
#    select version, name from supabase_migrations.schema_migrations order by version;
# 2) 저장소와 이름 기준으로 대조한다 (DB 접속 없음)
scripts/check-migration-history.sh applied.tsv
```

출력 네 종류: `DB_ONLY`(DB엔 있고 저장소 파일 없음 — 종료 코드 1) · `VERSION_DIFF`(이름은 같고 버전만 다름) · `REPO_ONLY`(저장소엔 있고 이 DB엔 미적용) · 나머지는 같음.
**이름으로 맞추는 이유**: Supabase MCP `apply_migration` 은 버전을 못 정하고 적용 시각으로 찍는다(예: 파일 `20261120100000` ↔ DB `20261119161532`).

## 2026-11-20 prd 결과 (prd 272건)

| 구분 | 건수 | 처리 |
|---|---|---|
| 버전·이름 모두 같음 | 105 | 조치 없음 |
| 이름만 같고 버전 다름 (`VERSION_DIFF`) | 137 | 아래 §버전 정렬 방침 |
| 저장소에 파일 없음 (`DB_ONLY`) | 29 → 26 | 이 PR 이 3건을 파일로 옮김. 나머지 26건은 아래 |

### 이 PR 이 저장소로 옮긴 3건 (원래 prd 버전·이름 유지, 멱등)

저장소에 같은 내용이 **없던** 것들이다.

- `20260617033010_update_sch_post_type_check_to_4_types` — `sch_post_mst.post_type` CHECK 4종
- `20260617135112_add_short_id_to_posts_and_competitions` — `generate_nanoid()` 정의 + `sch_post_mst`·`comp_mst.short_id`. **이게 없어서 새 DB 에 저장소만 적용하면 `20260620150000_gthr_mst_add_short_id` 가 `generate_nanoid` 없음으로 실패했다.**
- `20260627071444_create_push_sub_rel` — 웹 푸시 구독 테이블(저장소에 CREATE 가 없었다)

### 남은 DB_ONLY 26건 — 파일로 옮기지 않은 이유

- **본문이 주석 한 줄뿐인 7건**(`-- applied directly to prod`): `v2_mem_mst_insert_policy_oauth` · `evt_mileage_recompute_base_final` · `drop_ttl_rank` · `effect_mst_seed` · `ttl_ctgr_cd_add_event_category` · `fix_effect_mst_rls_show_all` · `alter_fee_mem_bal_snap_last_calc_dt_to_timestamptz`. 콘솔에서 직접 적용하고 이력만 남긴 것이라 prd 기록에 SQL 이 없다. 복원하려면 스키마 diff(아래)로 실제 차이를 봐야 한다.
- **나머지 19건**은 이름이 달라도 같은 객체를 저장소의 다른 파일이 정의하는 것으로 **이름·키워드 수준에서** 판단했다(예: `mcp_token_rel_and_audit_log` ↔ `mcp_token_rel`+`mcp_audit_log`, `story_feed_*`·`*_kst_helper`·`gathering_*` ↔ 저장소 후속 RPC 재정의, `noti_type_restore_batch_failed*` ↔ `noti_type_batch_failed` 이후 목록). **내용 diff 로 확인한 것은 아니다.**

## 아직 안 된 것 (완료 조건 미충족)

「새 빈 DB 에 저장소 마이그레이션만 적용한 스키마 ↔ prd 스키마 diff 0」은 **검증하지 못했다.** 로컬/브랜치 DB 에 적용한 뒤 `supabase db diff` 또는 pg_dump 스키마 비교가 필요하다. 그 결과로 위 26건 중 실제 빠진 객체를 가려 파일로 옮긴다. dev 에는 쓰지 않는다.

## 버전 정렬 방침 (VERSION_DIFF 137건)

- **저장소 파일 이름을 DB 버전에 맞추는 것을 기본으로 한다**(파일 `git mv`). 이미 적용된 DB 의 이력은 건드리지 않는다. 단, 같은 이름이 dev·prd 에서 버전이 서로 다르면 한쪽 기준만 맞출 수 있다 — 이때 `supabase db push` 가 어긋난 쪽을 미적용으로 보지 않도록 해당 DB 의 `schema_migrations.version` 을 파일 버전으로 고치는 UPDATE 가 필요하다(prd 는 사람 승인 뒤에만, 적용 순서는 `.claude/docs/migration-apply.md`).
- **앞으로**: MCP `apply_migration` 으로 적용했다면, 적용 직후 `select version from supabase_migrations.schema_migrations where name = '<이름>'` 로 찍힌 버전을 확인해 파일 이름을 그 버전에 맞춘다. 이름은 DB·파일이 같게 둔다(대조 스크립트가 이름 기준이다).
- 이 PR 은 137건의 일괄 개명·UPDATE 를 하지 않았다(범위·위험). 방침 확정 후 후속 PR 로 낸다.

## 같은 버전 파일 중복 해소

`20260529120000` 을 쓰는 파일이 둘이었다(`drop_title_point_columns` · `ttl_mst_drop_is_event_yn`). 적용 기록표는 버전당 1행이라 `supabase db push` 가 막힌다. `ttl_mst_drop_is_event_yn` 을 `20260529120001` 로 개명했다(실행 순서 유지: 앞 파일과 `140000` 사이).
이미 파일 효과가 반영된 DB 의 기록은 `supabase migration repair 20260529120001 --status applied` 로 맞춘다(prd 는 사람 승인 뒤에만).
