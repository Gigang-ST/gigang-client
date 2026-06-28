-- fee_grant_src_enm 에 'rule_attd_quest'(출석 감면 퀘스트) 값 추가.
--
-- 배경: 출석 기반 회비 감면(퀘스트) 면제는 기존 'rule_attd'(관리자 규칙 면제)와 반드시 분리해야 한다.
--   'rule_attd'로 두면 다음 부작용이 있다(설계 §5.3, 코드 확인):
--     - rollback-snapshot.ts 가 grant_src_enm='rule_attd' 면제를 일괄 삭제 → 스냅샷 롤백 시
--       출석 감면까지 같이 지워짐.
--     - manual 면제도 exm_cfg_id=null 을 쓰므로 exm_cfg_id IS NULL 단독 식별은 모호.
--   → 단일 enum 값 'rule_attd_quest'로 명확히 식별.
--
-- ⚠️ ALTER TYPE ... ADD VALUE 는 같은 트랜잭션 내에서 추가 직후 사용할 수 없다(Postgres 제약).
--    그래서 이 마이그레이션을 컬럼/인덱스 추가(다음 마이그레이션)보다 먼저 단독으로 둔다.
--    적용 후 database.types.ts 재생성 필요.

ALTER TYPE public.fee_grant_src_enm ADD VALUE IF NOT EXISTS 'rule_attd_quest';

COMMENT ON TYPE public.fee_grant_src_enm IS
  '회비 면제 출처: manual(수동) | rule_attd(관리자 규칙) | rule_attd_quest(출석 감면 퀘스트)';
