-- ───────────────────────────────────────────
-- 헬퍼 함수 (RLS에서 auth.uid() → member.id 변환)
-- ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.member
  WHERE kakao_user_id = auth.uid()::text
     OR google_user_id = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT admin FROM public.member
     WHERE kakao_user_id = auth.uid()::text
        OR google_user_id = auth.uid()::text
     LIMIT 1),
    false
  );
$$;

-- ───────────────────────────────────────────
-- project: 이벤트 프로젝트 (마일리지런 등)
-- ───────────────────────────────────────────
CREATE TABLE public.project (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text    NOT NULL,
  start_month date   NOT NULL,
  end_month   date   NOT NULL,
  status     text    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_select_all"  ON public.project FOR SELECT USING (true);
CREATE POLICY "project_admin_write" ON public.project FOR ALL    USING (public.is_admin());

-- ───────────────────────────────────────────
-- project_participation: 참여 정보
-- ───────────────────────────────────────────
CREATE TABLE public.project_participation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.project(id)  ON DELETE CASCADE,
  member_id          uuid NOT NULL REFERENCES public.member(id)   ON DELETE CASCADE,
  start_month        date NOT NULL,
  initial_goal       int  NOT NULL,
  deposit_confirmed  boolean NOT NULL DEFAULT false,
  singlet_fee_paid   boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, member_id)
);

ALTER TABLE public.project_participation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participation_select" ON public.project_participation
  FOR SELECT USING (member_id = public.get_member_id() OR public.is_admin());
CREATE POLICY "participation_insert" ON public.project_participation
  FOR INSERT WITH CHECK (member_id = public.get_member_id());
CREATE POLICY "participation_admin"  ON public.project_participation
  FOR ALL USING (public.is_admin());

-- ───────────────────────────────────────────
-- mileage_goal: 월별 목표
-- ───────────────────────────────────────────
CREATE TABLE public.mileage_goal (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid    NOT NULL REFERENCES public.project_participation(id) ON DELETE CASCADE,
  month            date    NOT NULL,
  goal_km          numeric(8,2) NOT NULL CHECK (goal_km > 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participation_id, month)
);

ALTER TABLE public.mileage_goal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mileage_goal_own" ON public.mileage_goal
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.project_participation pp
            WHERE pp.id = participation_id AND pp.member_id = public.get_member_id())
    OR public.is_admin()
  );

-- ───────────────────────────────────────────
-- event_multiplier: 배율 이벤트
-- ───────────────────────────────────────────
CREATE TABLE public.event_multiplier (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid    NOT NULL REFERENCES public.project(id) ON DELETE CASCADE,
  name       text    NOT NULL,
  multiplier numeric(4,2) NOT NULL CHECK (multiplier > 0),
  is_active  boolean NOT NULL DEFAULT true,
  start_date date,
  end_date   date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_multiplier ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_multiplier_select" ON public.event_multiplier FOR SELECT USING (true);
CREATE POLICY "event_multiplier_admin"  ON public.event_multiplier FOR ALL    USING (public.is_admin());

-- ───────────────────────────────────────────
-- activity_log: 운동 기록
-- ───────────────────────────────────────────
CREATE TABLE public.activity_log (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid    NOT NULL REFERENCES public.project_participation(id) ON DELETE CASCADE,
  activity_date    date    NOT NULL,
  sport            text    NOT NULL CHECK (sport IN ('running', 'trail_running', 'cycling', 'swimming')),
  distance_km      numeric(8,2) NOT NULL CHECK (distance_km > 0),
  elevation_m      int     NOT NULL DEFAULT 0 CHECK (elevation_m >= 0),
  base_mileage     numeric(8,2) NOT NULL,
  final_mileage    numeric(8,2) NOT NULL,
  review           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_own" ON public.activity_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.project_participation pp
            WHERE pp.id = participation_id AND pp.member_id = public.get_member_id())
    OR public.is_admin()
  );

-- ───────────────────────────────────────────
-- activity_log_event: 기록-이벤트 연결 (다대다)
-- ───────────────────────────────────────────
CREATE TABLE public.activity_log_event (
  activity_log_id     uuid NOT NULL REFERENCES public.activity_log(id)     ON DELETE CASCADE,
  event_multiplier_id uuid NOT NULL REFERENCES public.event_multiplier(id) ON DELETE RESTRICT,
  multiplier_snapshot numeric(4,2) NOT NULL,
  PRIMARY KEY (activity_log_id, event_multiplier_id)
);

ALTER TABLE public.activity_log_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_event_own" ON public.activity_log_event
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.activity_log al
      JOIN public.project_participation pp ON pp.id = al.participation_id
      WHERE al.id = activity_log_id
        AND pp.member_id = public.get_member_id()
    ) OR public.is_admin()
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_log_updated_at
  BEFORE UPDATE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
