-- 기록 카드 RPC 에 UTMB 인덱스(트레일) 추가. card_featured 에 {"sport":"trail_run","evt":"UTMB"} 로 선택 표현.

CREATE OR REPLACE FUNCTION public.get_public_member_card(
  p_mem_id uuid,
  p_team_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH best AS (
    SELECT
      c.comp_sprt_cd AS sport,
      COALESCE(ce.comp_evt_type, 'UNKNOWN') AS evt,
      rr.rec_time_sec,
      rr.race_nm,
      rr.race_dt,
      row_number() OVER (
        PARTITION BY c.comp_sprt_cd, COALESCE(ce.comp_evt_type, 'UNKNOWN')
        ORDER BY rr.rec_time_sec ASC
      ) AS rn
    FROM public.rec_race_hist rr
    LEFT JOIN public.comp_evt_cfg ce
      ON ce.comp_evt_id = rr.comp_evt_id AND ce.vers = 0 AND ce.del_yn = false
    LEFT JOIN public.comp_mst c
      ON c.comp_id = ce.comp_id AND c.vers = 0 AND c.del_yn = false
    WHERE rr.mem_id = p_mem_id AND rr.vers = 0 AND rr.del_yn = false
      AND c.comp_sprt_cd IS NOT NULL
  )
  SELECT jsonb_build_object(
    'mem_nm', mm.mem_nm,
    'avatar_url', mm.avatar_url,
    'badge_effect', COALESCE(tm.selected_badge_effect, 'none'),
    'frame_cd', COALESCE(tm.selected_frame_cd, 'frame-none'),
    'card_featured', tm.card_featured,
    'utmb_index', (
      SELECT up.utmb_idx
      FROM public.mem_utmb_prf up
      WHERE up.mem_id = mm.mem_id AND up.vers = 0 AND up.del_yn = false
      LIMIT 1
    ),
    'primary_title', (
      SELECT jsonb_build_object(
        'ttl_nm', t.ttl_nm,
        'ttl_desc', t.ttl_desc,
        'desc_visibility', t.desc_visibility
      )
      FROM public.mem_ttl_rel mtr
      INNER JOIN public.ttl_mst t ON t.ttl_id = mtr.ttl_id
      WHERE mtr.team_mem_id = tm.team_mem_id
        AND mtr.is_prmy_yn = true
        AND mtr.vers = 0 AND mtr.del_yn = false
      LIMIT 1
    ),
    'best_records', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'sport', b.sport,
          'evt', b.evt,
          'rec_time_sec', b.rec_time_sec,
          'race_nm', b.race_nm,
          'race_dt', b.race_dt
        ) ORDER BY b.sport, b.rec_time_sec
      )
      FROM best b WHERE b.rn = 1
    ), '[]'::jsonb)
  )
  FROM public.mem_mst mm
  INNER JOIN public.team_mem_rel tm
    ON tm.mem_id = mm.mem_id
   AND tm.team_id = p_team_id
   AND tm.vers = 0 AND tm.del_yn = false
  WHERE mm.mem_id = p_mem_id
    AND mm.vers = 0 AND mm.del_yn = false;
$$;
