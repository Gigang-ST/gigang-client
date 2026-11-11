-- 링크 미리보기·탭 제목·검색결과 문구를 팀 설정으로(`brand.name` · `seo.title` · `seo.title_suffix` · `seo.description`).
-- 예전엔 `config.ts` 에 기강 문구가 박혀 있어 울산 링크를 공유해도 「기강 러닝크루 | 양재천·강남…」이 떴다(2026-11-10).
-- 키 정의는 `lib/team-cfg/registry.ts`, 읽는 곳은 `lib/queries/site-metadata.ts`.
--
-- ⚠ **배포 전에** 넣는다. 네 키 모두 기본값이 없어서(다른 팀에 기강 문구가 새지 않게), 행 없이 새 코드가 나가면
-- 기강 링크 미리보기·탭 제목이 비어 버린다. 반대로 행만 먼저 있으면 옛 코드는 읽지 않아 아무 일도 없다 — 언제 넣어도 안전하다.
-- 기강 값은 옛 `config.ts` 문구 그대로라 기강 화면은 바뀌지 않는다. 모보브(울산) 문구는 임시 — 팀 설정 화면에서 고친다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.cfg_val_json
FROM (VALUES
  ('gigang', 'brand.name',       to_jsonb('기강'::text)),
  ('gigang', 'seo.title',        to_jsonb('기강 러닝크루 | 양재천·강남 러닝 스포츠팀'::text)),
  ('gigang', 'seo.title_suffix', to_jsonb('기강 러닝크루'::text)),
  ('gigang', 'seo.description',  to_jsonb('양재천·강남에서 함께 달리는 러닝크루 기강. 운동을 좋아하는 사람들이 모여 만든 스포츠 팀으로 러닝, 자전거, 수영, 여행을 함께합니다.'::text)),
  ('ulsan',  'brand.name',       to_jsonb('모보브'::text)),
  ('ulsan',  'seo.title',        to_jsonb('모보브 MOVOF | 울산 트레일러닝 크루'::text)),
  ('ulsan',  'seo.title_suffix', to_jsonb('모보브'::text)),
  ('ulsan',  'seo.description',  to_jsonb('울산에서 함께 산을 달리는 트레일러닝 크루 모보브(MOVOF). Climb hard, run wild.'::text))
) AS v(team_cd, cfg_cd, cfg_val_json)
JOIN public.team_mst t ON t.team_cd = v.team_cd
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_cfg c
  WHERE c.team_id = t.team_id AND c.cfg_cd = v.cfg_cd AND c.vers = 0
);
