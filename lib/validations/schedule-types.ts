export const SCH_POST_TYPES = ["race_entry", "sale", "session", "general"] as const;
export type SchPostType = typeof SCH_POST_TYPES[number];

export const schPostTypeLabels: Record<SchPostType, string> = {
  race_entry: "대회접수 정보",
  sale: "세일 정보",
  session: "세션 정보",
  general: "기타",
};

export const schPostTypeInlineLabel: Partial<Record<SchPostType, string>> = {
  race_entry: "접수",
  sale: "세일",
  session: "세션",
};
