-- #710 회비 거래 분류 3종 추가 — 운영자금 입출금 · 공금 반환 · 예치금 환급.
--
-- 운영자가 운영자금을 넣었다 빼거나 공금을 다시 넣은 거래가 「회비」로 확정돼 예치금이 부풀었다.
-- 개인 잔액(납부원장)에 들어가는 분류는 due 뿐이므로, 아래 셋은 확정돼도 회원 잔액을 안 바꾼다.
--   opr_fund    운영자금 입출금 (입금·출금 모두)
--   fund_return 공금 반환     (입금·출금 모두)
--   dep_refund  예치금 환급   (출금만 — 앱·MCP 가 방향을 검증한다)
-- 공용 항목(team_id NULL)이라 모든 팀이 쓴다. 새 컬럼·제약 변경 없음(fee_item_cd 는 공통코드로만 검증).
SET lock_timeout = '3s';

INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc,
       COALESCE((SELECT max(m.sort_ord) FROM public.cmm_cd_mst m
                 WHERE m.cd_grp_id = g.cd_grp_id AND m.vers = 0 AND m.del_yn = false), 0) + v.ord,
       false, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    ('opr_fund', '운영자금', '운영자가 운영자금을 넣었다 뺀 입출금 — 회원 잔액에 안 들어감', 1),
    ('fund_return', '공금 반환', '공금을 돌려주거나 다시 넣은 입출금 — 회원 잔액에 안 들어감', 2),
    ('dep_refund', '예치금 환급', '미리 낸 회비를 돌려준 출금 — 회원 잔액에 안 들어감', 3)
) AS v(cd, cd_nm, cd_desc, ord)
WHERE g.cd_grp_cd = 'FEE_ITEM_CD' AND g.vers = 0 AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;
