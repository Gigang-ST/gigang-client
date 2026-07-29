import { z } from "zod";

/**
 * 한마디 입력 상한 — 종이비행기가 끄는 견인 배너 한 줄에 넘치지 않는 길이.
 * DB CHECK(`ck_msg_mst_msg_txt_len`)는 1~40자로 더 넉넉하게 두고(상한 방어),
 * 실제 입력은 여기서 24자로 좁힌다 — 배너가 화면 폭 안에 들어와 지나가며 읽히는 게
 * 40자보다 중요하다(길면 스쳐 가는 동안 다 못 읽는다).
 *
 * 각오(`PLEDGE_TXT_MAX`)와 같은 24자지만 이유가 다르다: 저긴 팻말 판에 맞춘 길이고
 * 여긴 날아가는 배너에 맞춘 길이다. 한쪽을 고쳐도 다른 쪽이 따라올 이유는 없다.
 */
export const MESSAGE_TXT_MAX = 24;

/**
 * 한마디(message) 작성 입력 검증.
 * 클라이언트 검증은 UX 편의고, 실제 강제는 DB가 한다(각오·리액션과 같은 이중검증 원칙).
 */
export const createMessageSchema = z.object({
  msg_txt: z
    .string()
    .trim()
    .min(1, "한마디를 입력해주세요.")
    .max(MESSAGE_TXT_MAX, `한마디는 ${MESSAGE_TXT_MAX}자 이하로 입력해주세요.`),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
