"use server";

import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/queries/member";

interface CreateCompetitionInput {
  title: string;
  sport: string;
  startDate: string;
  endDate: string | null;
  location: string;
  eventTypes: string[];
  sourceUrl: string;
}

export async function createCompetition(input: CreateCompetitionInput) {
  // 1. 사용자 인증 + active 회원 확인
  const { member } = await getCurrentMember();

  if (!member || member.status !== "active") {
    return { ok: false, message: "활성 회원만 대회를 등록할 수 있습니다." };
  }

  // 3. admin 클라이언트로 대회 INSERT (RLS 우회)
  const admin = createAdminClient();
  const { error } = await admin.from("competition").insert({
    external_id: `manual:${crypto.randomUUID()}`,
    sport: input.sport,
    title: input.title.trim(),
    start_date: input.startDate,
    end_date: input.endDate || null,
    location: input.location.trim(),
    event_types: input.eventTypes,
    source_url: input.sourceUrl.trim(),
  });

  if (error) {
    console.error("대회 등록 실패:", error);
    return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
  }

  revalidateTag("competitions", "max");
  return { ok: true, message: null };
}
