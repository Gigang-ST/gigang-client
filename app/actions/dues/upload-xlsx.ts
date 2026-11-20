"use server";

import { withDuesAdmin } from "@/lib/actions/dues-guard";
import { hashBuffer, ingestDuesRows, parseKakaoXlsx, type ParsedRow } from "@/lib/dues/upload-core";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 카카오뱅크 거래내역 엑셀을 업로드해 미확정 거래로 적재한다. 파싱·매칭·중복 방지·분류 규칙은
 * `lib/dues/upload-core.ts`(클라이언트 주입식 — 운영 MCP `upload_dues_xlsx` 와 공유)에 있고,
 * 이 액션은 파일 읽기와 세션 신원·팀 해석만 맡는다.
 */
export async function uploadXlsx(formData: FormData) {
  return withDuesAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();

    const file = formData.get("file") as File | null;
    if (!file) return { ok: false as const, message: "파일이 없습니다." };

    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: ParsedRow[];
    try {
      rows = await parseKakaoXlsx(buffer);
    } catch {
      return { ok: false as const, message: "파일 파싱에 실패했습니다. 파일 형식을 확인하세요." };
    }

    const result = await ingestDuesRows(createAdminClient(), {
      teamId,
      actorMemId: member.id,
      fileName: file.name,
      fileHash: hashBuffer(buffer),
      rows,
    });
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, message: null, summary: result.summary };
  });
}
