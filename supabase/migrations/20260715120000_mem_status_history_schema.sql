-- 회원 상태 이력(vers) + 비활성/탈퇴 기간 회비 제외 — 스키마 준비 (조각 1/7)
-- 설계: docs/superpowers/specs/2026-07-15-회원상태이력-비활성회비제외-design.md §9
--
-- 확장-후-수축(expand) 원칙: 컬럼 추가는 non-destructive. 기본값/백필 후 NOT NULL.
-- 기존 조회 코드는 전부 vers=0·del_yn=false 필터라 새 컬럼 추가에 영향 없음.

-- 1) 재활성/재가입 잔액 초기화용 명시적 앵커 플래그.
--    현재 재계산은 crt_at < LEDGER_EPOCH(2026-07-02) 스냅샷만 앵커로 인정하는데,
--    재활성 초기화 스냅샷은 그 이후라 앵커로 안 잡힌다 → anchor_yn=true 로 명시 인정.
alter table public.fee_mem_bal_snap
  add column if not exists anchor_yn boolean not null default false;

comment on column public.fee_mem_bal_snap.anchor_yn is
  '명시적 앵커(개시잔액) 플래그. 재활성/재가입 잔액 초기화 스냅샷이 LEDGER_EPOCH 이후여도 앵커로 인정받게 한다. 재계산 앵커 판정 = (crt_at < LEDGER_EPOCH) OR anchor_yn=true.';

-- 2) 상태 효력 시각 — vers 이력에서 active 구간을 재구성해 "온전한 달" 부과를 판정하는 입력.
--    join_dt/leave_dt(date)는 가입·탈퇴만 담아 비활성/재활성 경계를 표현 못 하므로 별도 timestamptz.
alter table public.team_mem_rel
  add column if not exists eff_at timestamptz;

-- 기존 로우 백필: 현재 상태가 언제부터였는지 알 수 없으므로 crt_at(생성 시각)으로 근사.
-- ⚠️ 레거시 inactive/left 회원도 eff_at=crt_at(가입 시각)이 된다. 이후 재활성 시
--    buildActiveIntervals 가 "첫 세그먼트가 inactive면 재활성 실제 eff_at 부터만 active"로
--    처리하므로(lib/dues/ledger-replay.ts), 가입~재활성 전 구간이 자동 비활성 처리된다 —
--    정확한 비활성 시작일을 몰라도 잔액이 부풀지 않는 안전한 방향(design §12). 반대로
--    이 구간을 부과로 열려면 관리자가 실제 비활성 시작일을 입력받아 백필해야 한다.
update public.team_mem_rel set eff_at = crt_at where eff_at is null;

alter table public.team_mem_rel alter column eff_at set default now();
-- SET NOT NULL: 이 테이블은 소규모(활성 ~140명 + 이력 수 건)라 검사 잠금이 무시할 수준.
-- 대규모였다면 CHECK (eff_at IS NOT NULL) NOT VALID → VALIDATE → SET NOT NULL 확장 절차를 썼을 것.
alter table public.team_mem_rel alter column eff_at set not null;

comment on column public.team_mem_rel.eff_at is
  '이 상태(정본 vers=0/이력 vers>0)가 효력을 발생한 시각(KST tz-aware). vers 이력을 시간순 정렬해 active 구간을 재구성하고, 온전한 달(그 달 내내 active) 부과 판정에 쓴다. 과거 소급 이력은 추정 시각을 넣는다.';
