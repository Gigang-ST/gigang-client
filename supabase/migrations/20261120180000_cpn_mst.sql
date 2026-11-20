-- 쿠폰 기록(#712) — 송년회에서 나눠 주는 실물 쿠폰(싱글렛 할인권·대회 참가지원·프로젝트 참가비 할인)을
-- 잃어버려도 되게 웹에 적어 둔다.
--
-- 기록 장부일 뿐이다 — 금액 자동 차감·지원금 연동은 없다(사용 처리 + 메모만).
-- 금액은 선택(cpn_amt NULL 허용): 조건이 "참가비 50% 지원"처럼 글로만 적히는 쿠폰이 있어서다.
-- 유효기간 빈칸 = 기한 없음. 취소(발급 정정)는 del_yn 소프트 삭제.
-- 적용 순서: 이 마이그레이션 → 앱 배포 (옛 앱은 이 테이블을 모르고 그대로 동작).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.cpn_mst (
  cpn_id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  team_id        uuid        NOT NULL,
  mem_id         uuid        NOT NULL,                 -- 쿠폰을 가진 회원
  cpn_tp_cd      varchar     NOT NULL,                 -- SINGLET 싱글렛 할인 / COMP_SUPPORT 대회 참가지원 / PRJ_FEE 프로젝트 참가비 할인 / ETC 기타
  cpn_txt        text        NOT NULL,                 -- 쿠폰 내용(자유 텍스트) — 금액·조건을 글로 적는다
  cpn_amt        bigint,                               -- 금액(원, 선택)
  exp_dt         date,                                 -- 유효기간(이 날까지, KST 기준). NULL = 기한 없음
  used_yn        boolean     NOT NULL DEFAULT false,   -- 사용 여부
  used_dt        date,                                 -- 사용일
  used_memo_txt  text,                                 -- 사용 메모(어디에·얼마에 썼는지)
  used_by_mem_id uuid,                                 -- 사용 처리한 운영자
  reg_by_mem_id  uuid        NOT NULL,                 -- 발급한 운영자
  vers           integer     NOT NULL DEFAULT 0,
  del_yn         boolean     NOT NULL DEFAULT false,   -- true = 취소된 쿠폰
  crt_at         timestamptz NOT NULL DEFAULT now(),
  upd_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_cpn_mst PRIMARY KEY (cpn_id),
  CONSTRAINT fk_cpn_mst__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_cpn_mst__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_cpn_mst__reg_mem_mst FOREIGN KEY (reg_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE RESTRICT,
  CONSTRAINT fk_cpn_mst__used_mem_mst FOREIGN KEY (used_by_mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL,
  CONSTRAINT ck_cpn_mst_cpn_tp_cd CHECK (cpn_tp_cd IN ('SINGLET', 'COMP_SUPPORT', 'PRJ_FEE', 'ETC')),
  CONSTRAINT ck_cpn_mst_cpn_txt CHECK (length(btrim(cpn_txt)) > 0),
  CONSTRAINT ck_cpn_mst_cpn_amt CHECK (cpn_amt IS NULL OR cpn_amt >= 0)
);

CREATE INDEX IF NOT EXISTS ix_cpn_mst_team_mem ON public.cpn_mst (team_id, mem_id) WHERE del_yn = false;

CREATE TRIGGER cpn_mst_set_upd_at
  BEFORE UPDATE ON public.cpn_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.cpn_mst IS '쿠폰 기록(#712) — 실물 쿠폰의 웹 장부. 자동 차감·지원금 연동 없음(사용 처리 + 메모)';
COMMENT ON COLUMN public.cpn_mst.cpn_txt IS '쿠폰 내용(자유 텍스트, 예: 싱글렛 1만원 할인) — 금액·조건을 글로 적는다';
COMMENT ON COLUMN public.cpn_mst.cpn_amt IS '금액(원, 선택) — 비율·조건형 쿠폰은 비운다';
COMMENT ON COLUMN public.cpn_mst.exp_dt IS '유효기간(이 날까지 KST). NULL = 기한 없음';
COMMENT ON COLUMN public.cpn_mst.del_yn IS 'true = 취소된 쿠폰(회원에게도 안 보인다)';

ALTER TABLE public.cpn_mst ENABLE ROW LEVEL SECURITY;

-- 쓰기는 서버(service_role)만 — 운영 화면 액션·운영 MCP 가 한다. 읽기는 본인 + 그 팀 관리자.
DROP POLICY IF EXISTS cpn_mst_select_own ON public.cpn_mst;
CREATE POLICY cpn_mst_select_own ON public.cpn_mst
  FOR SELECT TO authenticated
  USING (del_yn = false AND mem_id = public.v2_rls_resolve_mem_id());

DROP POLICY IF EXISTS cpn_mst_select_team_admin ON public.cpn_mst;
CREATE POLICY cpn_mst_select_team_admin ON public.cpn_mst
  FOR SELECT TO authenticated
  USING (del_yn = false AND public.v2_rls_auth_team_owner_or_admin(team_id));

GRANT ALL ON TABLE public.cpn_mst TO service_role;
GRANT SELECT ON TABLE public.cpn_mst TO authenticated;
