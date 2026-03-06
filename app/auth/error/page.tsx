import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="w-full max-w-sm">
      <ErrorContent searchParams={searchParams} />
    </div>
  );
}

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="items-center text-center">
        <AlertTriangle className="size-12 text-destructive" />
        <CardTitle className="text-xl">오류가 발생했습니다</CardTitle>
        <CardDescription>
          {error ? `오류 코드: ${error}` : "알 수 없는 오류가 발생했습니다."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Link
          href="/auth/login"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          다시 시도
        </Link>
      </CardContent>
    </Card>
  );
}
