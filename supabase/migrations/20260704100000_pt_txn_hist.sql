-- ============================================================
-- 기강 포인트 제도 — enum + 원장 테이블 (pt_txn_hist)
-- 설계 문서: docs/design/2026-07-04-기강포인트제도.md §5.1
--
-- 히든 운영 원칙(§1): 적립 로직은 실제로 돌지만 UI 어디에도 노출하지 않는다.
--   원장은 처음부터 감사 가능(append-only)해야 추후 공개 시 이력이 그대로 살아있다.
--   도입 시점은 2026-07부터(과거 이력 백필 없음) — 트리거(마이그레이션 ②)에서 가드.
-- ============================================================

-- ------------------------------------------------------------
-- enum
-- ------------------------------------------------------------

CREATE TYPE public.pt_txn_type_enm AS ENUM ('earn', 'revoke', 'spend', 'manual_adj');

COMMENT ON TYPE public.pt_txn_type_enm IS
  '포인트 거래 유형: earn(적립) | revoke(회수, 역분개) | spend(사용, 추후 도입) | manual_adj(관리자 수동 조정)';

CREATE TYPE public.pt_actv_type_enm AS ENUM (
  'regular_attend',  -- 정모 참석 +30
  'gthr_attend',     -- 벙 참석 +10
  'evt_attend',      -- 이벤트 참석 +20
  'gthr_host',       -- 벙 개설 +5
  'comp_join',       -- 대회 참가 +20
  'comp_record',     -- 대회 기록 등록 +20
  'mlg_record',      -- 마일리지런 기록 +2 (1일 1건)
  'mlg_goal',        -- 마일리지런 월 목표 달성 +10
  'sch_post',        -- 정보 등록 +5
  'manual'           -- 관리자 수동 조정
);

COMMENT ON TYPE public.pt_actv_type_enm IS
  '포인트 적립 대상 활동 유형. 점수 상수는 public.pt_rule_amt(actv_type) 함수(마이그레이션 ②)에서 관리';

-- ------------------------------------------------------------
-- 원장 테이블
-- ------------------------------------------------------------

CREATE TABLE public.pt_txn_hist (
  pt_txn_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES public.team_mst(team_id),
  mem_id        uuid NOT NULL REFERENCES public.mem_mst(mem_id),
  actv_type_enm public.pt_actv_type_enm NOT NULL,
  txn_type_enm  public.pt_txn_type_enm NOT NULL,
  pt_amt        integer NOT NULL,          -- earn > 0, revoke/spend < 0 (CHECK)
  aply_dt       date NOT NULL,             -- 귀속 기준일 (KST, §4.3) — 월 집계는 이 컬럼으로 GROUP BY
  ref_type_txt  text,                      -- 원천 종류: 'gthr' | 'comp_reg' | 'race_result' | 'mlg_act' | 'mlg_goal' | 'sch_post'
  ref_id        uuid,                      -- 원천 PK (earn/revoke 짝 맞춤 키). mlg_record는 예외로 NULL(§5.2)
  rsn_txt       text,                      -- 사람이 읽을 사유. 예: "정모 참석: 6월 정기런"
  crt_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pt_amt_sign CHECK (
    (txn_type_enm = 'earn' AND pt_amt > 0)
    OR (txn_type_enm IN ('revoke', 'spend') AND pt_amt < 0)
    OR (txn_type_enm = 'manual_adj')
  )
);

COMMENT ON TABLE  public.pt_txn_hist               IS '기강 포인트 원장(append-only). UPDATE/DELETE 금지 — 정정은 manual_adj row 추가. 유저 비공개(§1, §7)';
COMMENT ON COLUMN public.pt_txn_hist.team_id        IS '소속 팀 (team_mst FK)';
COMMENT ON COLUMN public.pt_txn_hist.mem_id         IS '대상 멤버 (mem_mst FK)';
COMMENT ON COLUMN public.pt_txn_hist.actv_type_enm  IS '적립 대상 활동 유형';
COMMENT ON COLUMN public.pt_txn_hist.txn_type_enm   IS '거래 유형 (earn/revoke/spend/manual_adj)';
COMMENT ON COLUMN public.pt_txn_hist.pt_amt         IS '포인트 증감량. earn>0, revoke/spend<0, manual_adj는 부호 자유';
COMMENT ON COLUMN public.pt_txn_hist.aply_dt        IS '귀속 기준일(KST date). 월 랭킹·집계는 이 컬럼 기준 GROUP BY (§3-3)';
COMMENT ON COLUMN public.pt_txn_hist.ref_type_txt   IS '원천 테이블 종류 태그 (감사용)';
COMMENT ON COLUMN public.pt_txn_hist.ref_id         IS '원천 PK. net(mem, actv, ref) 판정의 짝 맞춤 키(§5.2). mlg_record만 NULL(1일 1건은 aply_dt로 판정)';
COMMENT ON COLUMN public.pt_txn_hist.rsn_txt        IS '사람이 읽을 수 있는 적립/회수 사유';
COMMENT ON COLUMN public.pt_txn_hist.crt_at         IS '원장 row 생성 시각(실제 적립 처리 시각, aply_dt와 다를 수 있음)';

-- 월 집계·랭킹용 (팀+멤버+귀속일 범위 조회)
CREATE INDEX ix_pt_txn_hist_mem_aply ON public.pt_txn_hist (team_id, mem_id, aply_dt);

-- 순액(net) 판정(earn/revoke 짝)용 — 트리거가 매 이벤트마다 조회
CREATE INDEX ix_pt_txn_hist_ref ON public.pt_txn_hist (mem_id, actv_type_enm, ref_id);

-- ------------------------------------------------------------
-- RLS — 노출 0 보장(§7). 정책을 하나도 만들지 않아 클라이언트 접근 전면 차단.
--   쓰기는 SECURITY DEFINER 트리거 함수(마이그레이션 ②)만 가능.
--   조회는 당분간 관리자 SQL(MCP)로만.
-- ------------------------------------------------------------

ALTER TABLE public.pt_txn_hist ENABLE ROW LEVEL SECURITY;

-- 방어선 추가: 스키마 기본 GRANT(ALTER DEFAULT PRIVILEGES 잔재)로 부여되는 테이블 권한 자체를 회수.
-- RLS(정책 0개)만으로도 차단되지만, 권한 레벨에서도 이중 차단(defense in depth).
REVOKE ALL ON TABLE public.pt_txn_hist FROM anon, authenticated;
