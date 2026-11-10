-- 칭호 기능 켜고 끄기(team_cfg `feature.titles`, 기본 켬) — 2026-11-10 유저 결정. 울산은 끈다.
--
-- 1) team_feature_on(팀, 키, 기본값): 팀 설정의 켜고 끄기 값을 DB 함수 안에서 읽는다. 행이 없거나 true/false 가 아니면 기본값.
--    호출은 SECURITY DEFINER 함수 안에서만 한다 — 그래서 일반 역할(anon·authenticated)의 실행 권한을 거둔다.
-- 2) get_public_member_card: 칭호를 끈 팀이면 칭호 목록·대표 칭호를 비우고 이펙트·프레임을 'none' 으로 내린다.
--    이 함수는 브라우저가 직접 부르므로(카드 팝업) 서버에서 걷을 수가 없다 — 그래서 여기서 거른다.
--    본문 전체를 다시 쓰지 않고 **지금 정의에서 세 곳만 바꿔** 다시 만든다(바꿀 곳을 못 찾으면 멈춘다). 함수가 길어
--    통째로 옮겨 적다 다른 줄이 어긋나는 걸 막으려는 것이다. 다른 화면(기강이야기·전당)은 서버가 넘기기 직전에 걷는다
--    (`lib/team-titles.ts`), 새로 주는 건 엔진·배치·관리자 수여가 같은 설정을 보고 멈춘다.
-- 3) 울산 feature.titles = false. 이미 받은 칭호 행은 지우지 않는다(울산은 0개).

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.team_feature_on(p_team_id uuid, p_cfg_cd text, p_default boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN jsonb_typeof(c.cfg_val_json) = 'boolean' THEN (c.cfg_val_json)::text::boolean END
       FROM public.team_cfg c
      WHERE c.team_id = p_team_id AND c.cfg_cd = p_cfg_cd AND c.vers = 0 AND c.del_yn = false
      LIMIT 1),
    p_default
  );
$$;

REVOKE ALL ON FUNCTION public.team_feature_on(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  -- 줄바꿈 통일 — Windows 에서 체크아웃한(CRLF) 파일로 로컬 DB 를 만들면 함수 본문에  이 섞여 아래 찾기가 어긋난다(PR #649 리뷰)
  d text := replace(pg_get_functiondef('public.get_public_member_card(uuid, uuid)'::regprocedure), E'\r\n', E'\n');
  r text[][] := ARRAY[
    ARRAY[
      'AND (mt.exp_at IS NULL OR mt.exp_at > now())',
      'AND (mt.exp_at IS NULL OR mt.exp_at > now())
    AND public.team_feature_on(p_team_id, ''feature.titles'', true)'
    ],
    ARRAY[
      '''badge_effect'',  COALESCE(me.selected_badge_effect, ''none''),',
      '''badge_effect'',  CASE WHEN public.team_feature_on(p_team_id, ''feature.titles'', true)
                        THEN COALESCE(me.selected_badge_effect, ''none'') ELSE ''none'' END,'
    ],
    ARRAY[
      '''frame_cd'',      COALESCE(me.selected_frame_cd, ''frame-none''),',
      '''frame_cd'',      CASE WHEN public.team_feature_on(p_team_id, ''feature.titles'', true)
                        THEN COALESCE(me.selected_frame_cd, ''frame-none'') ELSE ''frame-none'' END,'
    ]
  ];
  i int;
BEGIN
  IF position('feature.titles' IN d) > 0 THEN
    RAISE NOTICE 'get_public_member_card: 이미 칭호 기능 조건이 들어 있어 건너뜀';
    RETURN;
  END IF;
  FOR i IN 1 .. array_length(r, 1) LOOP
    IF (length(d) - length(replace(d, r[i][1], ''))) / length(r[i][1]) <> 1 THEN
      RAISE EXCEPTION 'get_public_member_card: 바꿀 곳(%)을 정확히 한 번 찾지 못함 — 정의가 예상과 다르다', r[i][1];
    END IF;
    d := replace(d, r[i][1], r[i][2]);
  END LOOP;
  EXECUTE d;
END $$;

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'feature.titles', 'false'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'feature.titles' AND c.vers = 0
  );
