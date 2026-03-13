import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const revalidateSecret = process.env.REVALIDATE_SECRET;
  if (!revalidateSecret) {
    return NextResponse.json(
      { error: "REVALIDATE_SECRET is not configured" },
      { status: 500 },
    );
  }

  const secret = request.headers.get("x-webhook-secret");

  if (secret !== revalidateSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/records");
  revalidatePath("/");
  revalidateTag("competitions", "max");

  return NextResponse.json({ revalidated: true });
}
