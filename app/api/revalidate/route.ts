import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { COMMON_CODES_CACHE_TAG } from "@/lib/common-codes-cache-tag";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/records");
  revalidatePath("/");
  revalidateTag("competitions", "max");
  revalidateTag(COMMON_CODES_CACHE_TAG, "max");
  // /records 의 unstable_cache(tags: "records", `records:${teamId}`)
  revalidateTag("records", "max");

  return NextResponse.json({ revalidated: true });
}
