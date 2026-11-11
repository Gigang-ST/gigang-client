/**
 * 팀별 이펙트 설정 합치기 — 이펙트 **목록**은 공용(`effect_mst`), 팀이 고르는 값(등급·사용 여부·해금 조건)은
 * `team_effect_cfg`(팀, 이펙트)에 있다. 팀 행이 없는 이펙트는 `effect_mst` 값이 기본값이다.
 *
 * 도감(`collection-sheet`)과 관리자 화면(`admin-effects-client`)이 같은 규칙으로 합쳐야 하므로 한 곳에 둔다.
 * 순수 함수 — 회귀 테스트 `lib/__tests__/team-effects.test.ts`.
 */

export type EffectTeamFields = {
  rarity_level: number;
  use_yn: boolean;
  unlock_cond_json: unknown;
};

export type TeamEffectOverride = EffectTeamFields & { effect_cd: string };

export function mergeTeamEffects<T extends EffectTeamFields & { effect_cd: string }>(
  base: readonly T[],
  overrides: readonly TeamEffectOverride[],
): T[] {
  const byCd = new Map(overrides.map((o) => [o.effect_cd, o]));
  return base.map((e) => {
    const o = byCd.get(e.effect_cd);
    return o ? { ...e, rarity_level: o.rarity_level, use_yn: o.use_yn, unlock_cond_json: o.unlock_cond_json } : e;
  });
}
