import { type NextRequest } from "next/server";

import { env } from "@/lib/env";

const ALLOWED_HOST_SUFFIXES = [".kakaocdn.net", ".googleusercontent.com"];

function isAllowed(target: URL): boolean {
  try {
    if (target.host === new URL(env.NEXT_PUBLIC_SUPABASE_URL).host) return true;
  } catch {
    /* ignore */
  }
  return ALLOWED_HOST_SUFFIXES.some((s) => target.host.endsWith(s));
}

/** 아바타 이미지를 같은 출처로 프록시한다 (JPG 캡처 시 canvas taint·mixed-content 방지). */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("invalid protocol", { status: 400 });
  }
  if (!isAllowed(target)) return new Response("host not allowed", { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return new Response("upstream fetch failed", { status: 502 });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response("redirect not allowed", { status: 502 });
  }
  if (!upstream.ok) return new Response("upstream error", { status: 502 });

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("not an image", { status: 415 });
  }
  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
