import { dayjs } from "@/lib/dayjs";

/** 회원 목록에서 2명 이상이 공유하는 이름 집합. 생년월일 표시 여부 판단에 쓴다. */
export function duplicateNames(members: { name: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= 2).map(([name]) => name));
}

/**
 * 후보/회원 표시 라벨. 동명이인(dupNames 포함)이고 birthDt가 유효할 때만
 * 이름 뒤에 생년월일을 붙여 구분한다. 그 외에는 이름만.
 */
export function memberLabel(
  m: { name: string; birthDt: string | null },
  dupNames: Set<string>,
): string {
  if (!dupNames.has(m.name) || !m.birthDt) return m.name;
  const d = dayjs(m.birthDt);
  if (!d.isValid()) return m.name;
  return `${m.name} (${d.format("YY.MM.DD")})`;
}
