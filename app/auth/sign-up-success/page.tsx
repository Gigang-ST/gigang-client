import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/grnMFGng";

export default function Page() {
  const chatPassword = process.env.KAKAO_CHAT_PASSWORD ?? "";

  return (
    <div className="w-full max-w-sm">
      <Card className="border-border shadow-sm">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-primary" />
          <CardTitle className="text-xl">가입이 완료되었습니다!</CardTitle>
          <CardDescription>기강에 오신 것을 환영합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 카카오톡 오픈채팅 안내 */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-center text-sm font-bold text-amber-900">
              💬 카카오톡 오픈채팅에 참여해 주세요!
            </p>
            <a
              href={KAKAO_OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#FEE500] px-4 py-2.5 text-sm font-bold text-neutral-900 transition-colors hover:bg-[#fdd835]"
            >
              💬 오픈채팅 참여하기
            </a>
            {chatPassword && (
              <p className="mt-2.5 text-center text-xs text-amber-800">
                비밀번호:{" "}
                <span className="font-bold text-amber-950">
                  {chatPassword}
                </span>
              </p>
            )}
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
            >
              홈으로 이동
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
