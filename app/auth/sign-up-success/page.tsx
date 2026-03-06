import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function Page() {
  return (
    <div className="w-full max-w-sm">
      <Card className="border-border shadow-sm">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-12 text-primary" />
          <CardTitle className="text-xl">가입이 완료되었습니다!</CardTitle>
          <CardDescription>기강에 오신 것을 환영합니다.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            홈으로 이동
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
