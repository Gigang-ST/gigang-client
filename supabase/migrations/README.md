# 마이그레이션 작성 규약

운영 중 스키마 변경(DDL)은 **AccessExclusive 락**(읽기까지 차단)을 잡아 핫테이블 전체를 멈출 수 있다.
실제로 `noti_mst` ALTER가 최대 120초 걸려 로그인 무한로딩을 유발한 적 있다(2026-06-29).
배경·이론은 [`.claude/docs/perf/db-lock-management.md`](../../.claude/docs/perf/db-lock-management.md) 참조.

## 규약 3줄 (모든 마이그레이션에 적용)

1. **첫 줄에 `SET lock_timeout = '3s';`**
   락을 3초 안에 못 잡으면 마이그레이션이 빨리 실패한다(테이블을 인질로 안 잡음). 실패하면 잠시 후 재실행.
2. **인덱스 추가/삭제는 `CONCURRENTLY`**
   `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`. 테이블 쓰기를 막지 않는다.
   ⚠️ `CONCURRENTLY`는 트랜잭션 안에서 못 돈다 → 인덱스 작업만 단독 파일로, 다른 DDL과 섞지 말 것.
3. **비피크 배포 + 위험 변경 단계화**
   사람 많은 시간대 지양. NOT NULL 추가·타입 변경·대량 백필은 Expand–Contract로 쪼갠다(아래 예시).

> `statement_timeout`은 마이그레이션에 짧게 걸지 않는다 — 대형 백필/인덱스 빌드가 정당하게 오래 걸릴 수 있어서다.
> 마이그레이션은 "락 대기"만 짧게 끊고(`lock_timeout`), 실행 자체는 끝까지 둔다.

## 템플릿

### 일반 DDL (컬럼 추가, 함수 변경 등)
```sql
-- <설명>
SET lock_timeout = '3s';

ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS <col> <type>;
-- ...
```

### 인덱스 (트랜잭션 밖, CONCURRENTLY — 이 파일엔 인덱스만)
```sql
SET lock_timeout = '3s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_<table>_<col>
  ON public.<table> (<col>);
```

### 위험 변경 — Expand–Contract (예: NOT NULL 추가)
```sql
-- STEP 1: nullable 컬럼 추가 (즉시, 락 짧음)
SET lock_timeout = '3s';
ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS <col> <type>;

-- STEP 2: 백필 (별도 마이그레이션/배치로 분할 — 한 트랜잭션에 수만 행 금지)

-- STEP 3: NOT VALID 제약 (풀스캔 안 함, 락 짧음)
SET lock_timeout = '3s';
ALTER TABLE public.<table>
  ADD CONSTRAINT <table>_<col>_not_null CHECK (<col> IS NOT NULL) NOT VALID;

-- STEP 4: 한가할 때 검증 (행 락 안 잡음)
ALTER TABLE public.<table> VALIDATE CONSTRAINT <table>_<col>_not_null;
```

## 체크리스트 (PR 전)

- [ ] 첫 줄에 `SET lock_timeout = '3s';` 있는가
- [ ] 인덱스는 `CONCURRENTLY`인가 (그리고 그 파일엔 인덱스만 있는가)
- [ ] 대량 백필을 한 트랜잭션에 몰아넣지 않았는가
- [ ] 핫테이블(`noti_mst`, `mem_mst`, `team_mem_rel` 등) 변경이면 비피크 배포 계획이 있는가
