import { z } from "zod";

/**
 * 각오 입력 상한 — 종이비행기가 끄는 견인 배너 한 줄에 넘치지 않는 길이.
 * DB CHECK(`ck_pldg_mst_pldg_txt_len`)는 1~40자로 더 넉넉하게 두고(상한 방어),
 * 실제 입력은 여기서 24자로 좁힌다 — 배너가 화면 폭 안에 들어와 지나가며 읽히는 게
 * 40자보다 중요하다(길면 스쳐 가는 동안 다 못 읽는다).
 */
export const PLEDGE_TXT_MAX = 24;

/**
 * 각오(pledge) 작성 입력 검증.
 * 클라이언트 검증은 UX 편의고, 실제 강제는 DB가 한다(story-reaction의 MAX_MY_RCTN과 같은 이중검증 원칙).
 */
export const createPledgeSchema = z.object({
  pldg_txt: z
    .string()
    .trim()
    .min(1, "각오를 입력해주세요.")
    .max(PLEDGE_TXT_MAX, `각오는 ${PLEDGE_TXT_MAX}자 이하로 입력해주세요.`),
});

export type CreatePledgeInput = z.infer<typeof createPledgeSchema>;
