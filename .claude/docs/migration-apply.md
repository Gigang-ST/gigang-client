# DB 마이그레이션 적용 절차 (dev → prd)

`supabase/migrations/*.sql` 파일을 **실제 DB에 적용**할 때의 순서다. 파일을 *쓰는* 규약(락·인덱스)은
[`supabase/migrations/README.md`](../../supabase/migrations/README.md), 여기는 *적용* 절차다.
세션마다 손으로 되풀이하다 같은 실수가 났다 — `apply_migration` 확인 만료(dev 2회·prd 1회),
적용 뒤 버전 정정(3세션), 컬럼 미확인으로 `column does not exist`(prd). 이슈 #688.

적용 도구는 Supabase 공식 MCP의 `apply_migration`(`supabase-gigang-dev` / `supabase-gigang-prd`)이다.
읽기 조회는 `execute_sql`. 서브에이전트·워커에게 적용을 맡길 땐 **이 문서를 가리킨다.**

## 순서

1. **파일 읽고 영향 범위 조회** — 파일이 건드리는 테이블·컬럼을 뽑아
   `information_schema.columns`로 **대상 DB에서** 먼저 조회한다
   (`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN (...)`).
   파일이 가정한 컬럼이 없거나 타입이 다르면 **멈추고 보고**한다. dev에 있다고 prd에 있다고 가정하지 않는다.
2. **dev 적용** — `supabase-gigang-dev`의 `apply_migration`. `name`은 파일명에서 버전 접두사를 뺀 snake_case,
   `query`는 파일 내용 그대로. 이어서 **읽기 검증**(`execute_sql`로 바뀐 컬럼·함수·행 수가 기대값인지) 한다.
3. **적용 기록 버전 대조** — `apply_migration`은 적용 시각으로 버전을 새로 매긴다. 파일명 버전과 같은지 본다:
   `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
   다르면 `UPDATE supabase_migrations.schema_migrations SET version = '<파일명 버전>' WHERE version = '<찍힌 버전>';`
   로 정정하고 다시 조회해 확인한다(안 맞추면 다음 `supabase db push`·`migration list`가 어긋난다).
4. **prd는 사람 승인 뒤에만** — 운영 적용은 PR이 dev에 머지된 뒤(AGENTS.md §브랜치 전략)이고, 사람의 명시적 승인을
   받은 다음 **1~3을 prd에 같은 순서로** 한다(prd에서 1을 다시 조회 — dev 결과로 대신하지 않는다).
5. **단계마다 기대값이 아니면 멈추고 보고한다.** 에러를 고쳐 가며 이어 붙이지 않는다.
   일부만 적용된 상태일 수 있으니 무엇이 적용됐는지 조회해서 함께 보고한다.

## `apply_migration` 확인 만료 — 2분

`apply_migration`은 사람 확인을 기다리는데 **2분이 넘으면 만료**된다.

- 호출 **전에** 사람에게 "곧 확인 요청이 가니 바로 눌러 달라"고 알린다.
- 만료되면 **같은 인자로 바로 다시 호출**한다(파일 내용·`name`을 바꾸지 않는다). 만료는 실패가 아니다 —
  다만 적용이 되지 않았음을 `schema_migrations`로 확인한 뒤 다시 부른다.

## 체크리스트

- [ ] 대상 DB에서 `information_schema.columns` 조회로 컬럼·타입 확인
- [ ] dev `apply_migration` → 읽기 검증 통과
- [ ] `schema_migrations` 버전 = 파일명 버전 (아니면 정정 후 재조회)
- [ ] (prd) 사람 승인 받음 → 같은 순서 반복
- [ ] 적용 전 사람에게 2분 만료 예고함
