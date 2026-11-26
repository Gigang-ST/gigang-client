-- 울산 크루 확정값(2026-11-23 송창준 회신) — 임시로 넣어 둔 「모보브(MOVOF)」·슬로건을 실제 값으로 바꾸고, 개인정보 문의 연락처를 넣는다.
--
-- - 크루 이름 = 모비(고유명사, 「mob by」 우리들의 느낌으로) · 영문 워드마크 MOBBY · 슬로건 hobby is mountain
-- - 링크 미리보기·탭 제목(`seo.*`)도 새 이름으로
-- - 개인정보 문의 연락처 = 이메일만(기강과 같은 방식 — 약관은 비로그인도 본다). 코드 기본값(`lib/legal-docs.ts` TEAM_LEGAL.ulsan)과 같은 값
--
-- 이미 있는 행은 바꾸고(값이 같으면 손대지 않는다), 없는 행(`brand.wordmark`·`legal.contact`)은 만든다. 바뀌는 행의 옛 값은
-- 트리거(`team_cfg_keep_history`)가 vers>0 이력으로 남긴다. 여러 번 돌려도 같은 결과다.
-- 옛 코드도 이 키들을 이미 읽으므로 배포 전·후 어느 쪽이든 되지만, 링크 미리보기 이름이 로고와 함께 바뀌도록 **배포 전**을 권한다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.val
FROM public.team_mst t
JOIN (
  VALUES
    ('brand.name',       to_jsonb('모비'::text)),
    ('brand.wordmark',   to_jsonb('MOBBY'::text)),
    ('brand.slogan',     to_jsonb('hobby is mountain'::text)),
    ('seo.title',        to_jsonb('모비 MOBBY | 울산 트레일러닝 크루'::text)),
    ('seo.title_suffix', to_jsonb('모비'::text)),
    ('seo.description',  to_jsonb('울산에서 함께 산을 달리는 트레일러닝 크루 모비(MOBBY). hobby is mountain.'::text)),
    ('legal.contact',    to_jsonb('zkzkdksek2@naver.com'::text))
) AS v(cfg_cd, val) ON t.team_cd = 'ulsan'
ON CONFLICT (team_id, cfg_cd, vers) DO UPDATE
  SET cfg_val_json = EXCLUDED.cfg_val_json, del_yn = false, upd_at = now()
  WHERE team_cfg.cfg_val_json IS DISTINCT FROM EXCLUDED.cfg_val_json OR team_cfg.del_yn;
