-- 팀 설정(team_cfg) 기강 값 — 코드에 박혀 있던 워드마크·정기 모임 템플릿을 기강 팀 설정 행으로 옮긴다.
--
-- 두 키 모두 **기본값이 없다**(행이 없으면 안 그린다/안 채운다) — 기본값을 기강 값으로 두면 울산 모임 공유 카드에
-- `GIGANG` 이 찍히고, 울산 정기 모임에 기강 코스·문구가 채워진다. 키 정의는 `lib/team-cfg/registry.ts`.
--   - brand.wordmark              : 모임 공유 이미지(OG) 맨 아래 글자. 예전 `app/api/og/gathering/route.tsx` 의 "GIGANG"
--   - gathering.regular_template  : 모임 만들기에서 「정기」를 고르면 채우는 제목·시작 시각·비고.
--                                   예전 `lib/gathering/templates.ts` 상수(문구는 한 글자도 바꾸지 않았다)
-- 울산 값은 울산 운영진이 정하면 같은 INSERT 로 넣는다(그 전엔 울산 카드엔 글자가 없고, 정기 자동 채움도 없다).

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.cfg_val_json
FROM (SELECT team_id FROM public.team_mst WHERE team_cd = 'gigang') t
CROSS JOIN (VALUES
  ('brand.wordmark', to_jsonb('GIGANG'::text)),
  ('gathering.regular_template', '{"title": "🔥 정기 기강런", "default_time": "19:30", "desc": "🏃 정기러닝 안내 🏃\n\n즐거운 모임을 위해 정기러닝을 진행합니다. 🎉\n번개와 공지로만 운영하던 모임에 정기적인 만남의 날을 마련해,\n기강인들끼리 더 자주 교류하고 신규 인원도 부담 없이\n참여할 수 있는 자리를 만들어갑니다. 😊\n\n🏞 러닝 코스\n· 기본 코스 7K (당일 상황에 따라 조정)\n· 새싹 코스 4K (당일 상황에 따라 조정)\n\n⚠️ 유의사항\n· 코스는 날씨·현장 상황에 따라 변경될 수 있습니다."}'::jsonb)
) AS v(cfg_cd, cfg_val_json)
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_cfg c
  WHERE c.team_id = t.team_id AND c.cfg_cd = v.cfg_cd AND c.vers = 0
);
