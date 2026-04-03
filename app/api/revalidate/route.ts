import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/records");
  revalidatePath("/");
  revalidateTag("competitions", "max");

  return NextResponse.json({ revalidated: true });
}
