"use server";

import { updateTag } from "next/cache";

import { withActive } from "@/lib/actions/auth";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRecordFlexSchema,
  POST_PHOTO_MAX_BYTES,
  POST_PHOTO_TYPES,
} from "@/lib/validations/post";

/** 자랑 사진 최대 폭 — 아바타(512 정사각 crop)와 달리 비율을 유지하고 폭만 제한한다 */
const PHOTO_MAX_WIDTH = 1080;
const PHOTO_QUALITY = 80;

export type CreateRecordFlexResult =
  | { ok: false; message: string }
  | { ok: true; post_id: string };

/**
 * 기록 자랑 작성 — 사진 + 한마디 + 거리/날짜/종목을 팻말로 세운다.
 *
 * 사진이 있어 `FormData`로 받는다(각오와 달리 JSON이 아니다). 업로드는 세션 클라이언트로
 * `post-photos` 버킷에, DB INSERT는 admin 클라이언트로 한다 — `createPledge`와 같은 경계다.
 *
 * 순서가 중요하다: **사진 업로드를 먼저, INSERT를 나중에** 한다. 반대로 하면 업로드가 실패했을 때
 * 사진 없는 행이 남아 팻말이 반쪽으로 뜬다. 대신 INSERT가 실패하면 올린 파일을 되돌려 지운다
 * (고아 파일을 남기지 않는다).
 *
 * `story-posts` 태그만 무효화한다 — `story-feed`까지 날리면 자랑 한 건이 피드 전체 캐시를
 * 끌고 내려간다(태그를 분리한 이유가 이것이다).
 */
export async function createRecordFlex(
  formData: FormData,
): Promise<CreateRecordFlexResult> {
  const rawDst = formData.get("dst_km");
  const parsed = createRecordFlexSchema.safeParse({
    cmnt_txt: String(formData.get("cmnt_txt") ?? ""),
    dst_km: rawDst === null || rawDst === "" ? NaN : Number(rawDst),
    sprt_enm: String(formData.get("sprt_enm") ?? ""),
    act_dt: String(formData.get("act_dt") ?? ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, message: "사진을 한 장 올려주세요." };
  }
  if (file.size > POST_PHOTO_MAX_BYTES) {
    return { ok: false, message: "사진은 10MB 이하만 가능합니다." };
  }
  if (!POST_PHOTO_TYPES.includes(file.type)) {
    return { ok: false, message: "JPG, PNG, WebP, HEIC 형식만 가능합니다." };
  }

  try {
    return await withActive(async ({ member, supabase }) => {
      const { teamId } = await getRequestTeamContext();

      let buffer = Buffer.from(await file.arrayBuffer());

      // iPhone 기본 포맷 — sharp가 HEIC를 못 읽으므로 JPEG로 먼저 돌린다(아바타와 동일)
      if (file.type === "image/heic" || file.type === "image/heif") {
        try {
          // @ts-expect-error -- heic-convert에 타입 선언 없음
          const { default: convert } = await import("heic-convert");
          buffer = Buffer.from(
            await convert({ buffer, format: "JPEG", quality: 0.9 }),
          );
        } catch (e) {
          console.error("[createRecordFlex] heic-convert 실패", e);
          return {
            ok: false as const,
            message: "HEIC 변환에 실패했습니다. JPG로 변환 후 다시 시도해 주세요.",
          };
        }
      }

      let resized: Buffer;
      try {
        const { default: sharp } = await import("sharp");
        resized = await sharp(buffer)
          // .rotate()는 EXIF 방향을 적용한다 — 없으면 세로로 찍은 사진이 눕는다
          .rotate()
          .resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: PHOTO_QUALITY })
          .toBuffer();
      } catch (e) {
        console.error("[createRecordFlex] sharp 실패", e);
        return {
          ok: false as const,
          message: "이미지 처리에 실패했습니다. JPG 또는 PNG로 다시 시도해 주세요.",
        };
      }

      const filePath = `${member.id}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("post-photos")
        .upload(filePath, resized, { contentType: "image/webp" });
      if (uploadError) {
        console.error("[createRecordFlex] 업로드 실패", uploadError);
        return { ok: false as const, message: "사진 업로드에 실패했습니다." };
      }

      const photoUrl = supabase.storage.from("post-photos").getPublicUrl(filePath)
        .data.publicUrl;

      const admin = createAdminClient();
      const { data, error } = await admin
        .from("post_mst")
        .insert({
          team_id: teamId,
          mem_id: member.id,
          post_type_enm: "record_flex",
          src_enm: "manual",
          photo_url: photoUrl,
          cmnt_txt: parsed.data.cmnt_txt,
          dst_km: parsed.data.dst_km,
          sprt_enm: parsed.data.sprt_enm,
          act_dt: parsed.data.act_dt,
        })
        .select("post_id")
        .single();

      if (error || !data) {
        console.error("[createRecordFlex] 저장 실패", error);
        // 행이 안 생겼으면 방금 올린 사진은 아무도 참조하지 않는다 — 고아로 두지 않는다
        await supabase.storage.from("post-photos").remove([filePath]);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      // `revalidateTag(tag, "max")`가 아니라 `updateTag(tag)`다 — 프로필을 준 revalidateTag는
      // stale-while-revalidate라 Next가 일부러 액션이 자기 쓰기를 되읽지 못하게 막는다. 그러면
      // 꽂자마자 router.refresh()가 낡은 캐시를 받아 "새로고침해야 팻말이 보이는" 증상이 난다.
      // (같은 이유·같은 처방이 createPledge/floatPledge에도 적용돼 있다.)
      updateTag("story-posts");
      return { ok: true as const, post_id: data.post_id };
    });
  } catch (e) {
    // withActive는 비로그인·비활성이면 throw한다 — createPledge와 동일하게 결과값으로 변환
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
