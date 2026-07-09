"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// 개발 모드 판정은 lib/dev-mode.ts로 통합(서버·클라 공용, env.ts 경유). 기존 import 경로 호환을 위해 re-export.
export { isDevModeEnabled } from "@/lib/dev-mode";

type DevEmailLoginProps = {
	/** OAuth와 동일한 로그인 후 이동 경로 */
	redirectPath: string;
	/** true면 카카오/Google 버튼과 동시에 누를 수 없게 비활성화 */
	oauthBusy: boolean;
	className?: string;
};

/** Supabase 이메일·비밀번호 로그인. `isDevModeEnabled()`가 true일 때만 마운트합니다. */
export function DevEmailLogin({
	redirectPath,
	oauthBusy,
	className,
}: DevEmailLoginProps) {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		if (!email.trim() || !password) {
			setError("이메일과 비밀번호를 입력해 주세요.");
			return;
		}
		setBusy(true);
		try {
			const supabase = createClient();
			const { error: signError } = await supabase.auth.signInWithPassword({
				email: email.trim(),
				password,
			});
			if (signError) {
				setError(signError.message);
				return;
			}
			router.push(redirectPath);
			router.refresh();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			className={cn(
				"w-full rounded-xl border border-dashed border-warning/40 bg-warning/5 p-4",
				className,
			)}
		>
			<p className="mb-3 text-center text-xs font-medium text-warning">
				개발 환경 전용 · 이메일 로그인
			</p>
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<div className="space-y-1.5">
					<Label htmlFor="dev-email-login-email">이메일</Label>
					<Input
						id="dev-email-login-email"
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={busy || oauthBusy}
						placeholder="test@example.com"
						className="h-10"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dev-email-login-password">비밀번호</Label>
					<Input
						id="dev-email-login-password"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={busy || oauthBusy}
						className="h-10"
					/>
				</div>
				{error ? (
					<p className="text-center text-sm text-destructive">{error}</p>
				) : null}
				<Button
					type="submit"
					variant="secondary"
					className="h-10 w-full"
					disabled={busy || oauthBusy}
				>
					{busy ? "로그인 중..." : "이메일로 로그인"}
				</Button>
			</form>
		</div>
	);
}
