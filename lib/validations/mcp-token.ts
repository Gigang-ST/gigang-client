import { z } from "zod";

/** MCP 토큰 label(기기·용도 구분용) — 선택 입력, 최대 40자 */
export const MCP_TOKEN_LABEL_MAX = 40;

export const mcpTokenLabelSchema = z
  .string()
  .trim()
  .max(MCP_TOKEN_LABEL_MAX, `이름은 ${MCP_TOKEN_LABEL_MAX}자 이하로 입력해 주세요`);

/** 토큰 발급 폼(`/mcp-tokens`) — label은 선택(빈 문자열 허용, 미지정 시 null 저장) */
export const createMcpTokenSchema = z.object({
  label: mcpTokenLabelSchema,
});

export type CreateMcpTokenValues = z.infer<typeof createMcpTokenSchema>;
