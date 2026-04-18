-- =============================================================
-- 마일리지런 이벤트 테이블 (5개)
-- evt_team_mst, evt_team_prt_rel, evt_mlg_goal_cfg,
-- evt_mlg_act_hist, evt_mlg_mult_cfg
-- =============================================================

-- 1. evt_team_mst: 팀 이벤트 마스터
-- 마일리지런, 동계훈련 등 팀 단위 이벤트/프로젝트 정보
create table if not exists public.evt_team_mst (
  evt_id      uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.team_mst(team_id),
  evt_nm      varchar(100) not null,
  evt_type_cd varchar(20) not null,
  stt_dt      date not null,
  end_dt      date not null,
  status_cd   varchar(20) not null default 'READY',
  "desc"      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table  public.evt_team_mst is '팀 이벤트 마스터';
comment on column public.evt_team_mst.evt_nm      is '이벤트명';
comment on column public.evt_team_mst.evt_type_cd  is '이벤트 유형 코드 (MILEAGE_RUN 등)';
comment on column public.evt_team_mst.stt_dt       is '시작일';
comment on column public.evt_team_mst.end_dt       is '종료일';
comment on column public.evt_team_mst.status_cd    is '상태 (READY/ACTIVE/CLOSED)';

-- 2. evt_team_prt_rel: 이벤트 참여 관계
-- 회원의 이벤트 참여 신청 및 승인 관리
create table if not exists public.evt_team_prt_rel (
  prt_id          uuid primary key default gen_random_uuid(),
  evt_id          uuid not null references public.evt_team_mst(evt_id),
  mem_id          uuid not null references public.mem_mst(mem_id),
  stt_month       date not null,
  init_goal       integer not null,
  deposit_amt     integer not null,
  entry_fee_amt   integer not null,
  singlet_fee_amt integer not null default 0,
  has_singlet_yn  boolean not null default false,
  approve_yn      boolean not null default false,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_evt_team_prt_rel unique (evt_id, mem_id)
);
comment on table  public.evt_team_prt_rel is '이벤트 참여 관계';
comment on column public.evt_team_prt_rel.stt_month       is '참여 시작월 (ex: 2026-05-01)';
comment on column public.evt_team_prt_rel.init_goal       is '초기 목표 마일리지 (50/100/자유)';
comment on column public.evt_team_prt_rel.deposit_amt     is '보증금 (잔여개월 × 1만)';
comment on column public.evt_team_prt_rel.entry_fee_amt   is '참가비 (1만)';
comment on column public.evt_team_prt_rel.singlet_fee_amt is '싱글렛비 (0 or 1만)';
comment on column public.evt_team_prt_rel.has_singlet_yn  is '싱글렛 보유 여부';
comment on column public.evt_team_prt_rel.approve_yn      is '운영진 입금확인 승인 여부';

-- 3. evt_mlg_goal_cfg: 월별 목표 설정
-- 회원의 월별 마일리지 목표 관리 (달성 시 자동 상향)
create table if not exists public.evt_mlg_goal_cfg (
  goal_id     uuid primary key default gen_random_uuid(),
  evt_id      uuid not null references public.evt_team_mst(evt_id),
  mem_id      uuid not null references public.mem_mst(mem_id),
  goal_month  date not null,
  goal_val    integer not null,
  achieved_yn boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_evt_mlg_goal_cfg unique (evt_id, mem_id, goal_month)
);
comment on table  public.evt_mlg_goal_cfg is '마일리지 월별 목표 설정';
comment on column public.evt_mlg_goal_cfg.goal_month  is '대상월 (ex: 2026-05-01)';
comment on column public.evt_mlg_goal_cfg.goal_val    is '목표 마일리지 (정수)';
comment on column public.evt_mlg_goal_cfg.achieved_yn is '달성 여부';

-- 4. evt_mlg_act_hist: 활동 기록
-- 회원의 개별 운동 기록 (배율 스냅샷 포함)
create table if not exists public.evt_mlg_act_hist (
  act_id         uuid primary key default gen_random_uuid(),
  evt_id         uuid not null references public.evt_team_mst(evt_id),
  mem_id         uuid not null references public.mem_mst(mem_id),
  act_dt         date not null,
  sport_cd       varchar(20) not null,
  distance_km    numeric(6,2) not null,
  elevation_m    numeric(7,1),
  base_mlg       numeric(6,2) not null,
  applied_mults  jsonb,
  final_mlg      numeric(6,2) not null,
  review         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table  public.evt_mlg_act_hist is '마일리지 활동 기록';
comment on column public.evt_mlg_act_hist.act_dt         is '활동 날짜';
comment on column public.evt_mlg_act_hist.sport_cd       is '종목 (RUNNING/TRAIL/CYCLING/SWIMMING)';
comment on column public.evt_mlg_act_hist.distance_km    is '거리 (km)';
comment on column public.evt_mlg_act_hist.elevation_m    is '상승고도 (m), 수영은 null';
comment on column public.evt_mlg_act_hist.base_mlg       is '기본 마일리지 (배율 적용 전)';
comment on column public.evt_mlg_act_hist.applied_mults  is '적용 배율 스냅샷 [{"mult_id","mult_nm","mult_val"}]';
comment on column public.evt_mlg_act_hist.final_mlg      is '최종 마일리지 (배율 적용 후)';
comment on column public.evt_mlg_act_hist.review         is '한 줄 후기';

-- 5. evt_mlg_mult_cfg: 이벤트 배율 설정
-- 운영진이 관리하는 마일리지 배율 마스터
create table if not exists public.evt_mlg_mult_cfg (
  mult_id     uuid primary key default gen_random_uuid(),
  evt_id      uuid not null references public.evt_team_mst(evt_id),
  mult_nm     varchar(100) not null,
  mult_val    numeric(3,2) not null,
  stt_dt      date,
  end_dt      date,
  active_yn   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table  public.evt_mlg_mult_cfg is '마일리지 이벤트 배율 설정';
comment on column public.evt_mlg_mult_cfg.mult_nm   is '배율명 (ex: 비 올 때)';
comment on column public.evt_mlg_mult_cfg.mult_val  is '배율값 (ex: 1.20)';
comment on column public.evt_mlg_mult_cfg.stt_dt    is '시작일 (null=상시)';
comment on column public.evt_mlg_mult_cfg.end_dt    is '종료일 (null=상시)';
comment on column public.evt_mlg_mult_cfg.active_yn is '활성 여부';

-- RLS 활성화
alter table public.evt_team_mst     enable row level security;
alter table public.evt_team_prt_rel enable row level security;
alter table public.evt_mlg_goal_cfg enable row level security;
alter table public.evt_mlg_act_hist enable row level security;
alter table public.evt_mlg_mult_cfg enable row level security;

-- RLS 정책: 인증된 사용자 읽기 허용
create policy "evt_team_mst_select" on public.evt_team_mst for select to authenticated using (true);
create policy "evt_team_prt_rel_select" on public.evt_team_prt_rel for select to authenticated using (true);
create policy "evt_mlg_goal_cfg_select" on public.evt_mlg_goal_cfg for select to authenticated using (true);
create policy "evt_mlg_act_hist_select" on public.evt_mlg_act_hist for select to authenticated using (true);
create policy "evt_mlg_mult_cfg_select" on public.evt_mlg_mult_cfg for select to authenticated using (true);
