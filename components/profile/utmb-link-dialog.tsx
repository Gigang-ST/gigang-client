"use client";

import { useState } from "react";

import {
	deleteUtmbProfile,
	saveUtmbProfile,
} from "@/app/actions/save-utmb-profile";
import { fetchUtmbIndex } from "@/app/actions/utmb";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type UtmbProfile = {
	utmb_profile_url: string;
	utmb_index: number;
	recent_race_name?: string | null;
	recent_race_record?: string | null;
};

/**
 * UTMB 연동 다이얼로그 — 프로필 번호로 utmb.world에서 인덱스를 긁어와 저장한다.
 *
 * 원래 `PersonalBestGrid` 안에 붙어 있던 폼을 그대로 떼어냈다(로직 변경 없음).
 * 기록 칸이 프로필 카드 안으로 들어가면서 그리드는 사라졌지만, 이 폼은 그대로 쓰인다 —
 * 카드의 `UTMB INDEX` 줄에서 `연동하기`를 누르거나 인덱스를 눌러 열린다.
 */
export function UtmbLinkDialog({
	open,
	onOpenChange,
	utmb,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** 현재 연동 정보 — 없으면 신규 연동 */
	utmb: UtmbProfile | null;
	/** 저장·삭제 후 호출. `null`이면 연동 해제 */
	onSaved: (next: UtmbProfile | null) => void;
}) {
	const [utmbUrl, setUtmbUrl] = useState("");
	const [utmbIndex, setUtmbIndex] = useState<number | null>(null);
	const [utmbName, setUtmbName] = useState("");
	const [fetching, setFetching] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [isError, setIsError] = useState(false);
	const [recentRaceName, setRecentRaceName] = useState("");
	const [recentRaceRecord, setRecentRaceRecord] = useState("");

	const toShortId = (url: string) => {
		const match = url.match(/\/runner\/(.+)$/);
		return match ? match[1] : url;
	};

	/**
	 * 입력값 → utmb.world 프로필 URL.
	 *
	 * 입력칸은 `123456.gildong.hong` 같은 짧은 id를 기대하지만 전체 URL을 그대로 붙여넣는
	 * 사람도 있다. 조회·저장·"프로필 보기" **세 곳이 같은 규칙을 써야** 한다 — 예전엔 링크만
	 * 무조건 접두를 붙여서, URL을 붙여넣으면 `.../runner/https://utmb.world/runner/...`로
	 * 깨진 주소가 열렸다.
	 */
	const toProfileUrl = (input: string) => {
		const v = input.trim();
		return v.startsWith("http") ? v : `https://utmb.world/en/runner/${v}`;
	};

	const handleOpenChange = (v: boolean) => {
		onOpenChange(v);
		if (v) {
			// 열 때마다 현재 값으로 되돌린다 — 닫고 다시 열면 이전 편집이 남지 않게.
			setUtmbUrl(utmb?.utmb_profile_url ? toShortId(utmb.utmb_profile_url) : "");
			setUtmbIndex(utmb?.utmb_index ?? null);
			setUtmbName("");
			setRecentRaceName(utmb?.recent_race_name ?? "");
			setRecentRaceRecord(utmb?.recent_race_record ?? "");
			setMessage(null);
			setIsError(false);
		}
	};

	const handleFetch = async () => {
		if (!utmbUrl.trim()) {
			setMessage("번호와 이름을 입력해 주세요.");
			setIsError(true);
			return;
		}
		setFetching(true);
		setMessage(null);
		// 로딩 플래그 해제는 반드시 finally에서 — 서버 액션이 reject되면(네트워크 끊김 등)
		// 성공 경로에 둔 리셋에 도달하지 못해 버튼이 영구히 disabled로 굳는다.
		try {
			const result = await fetchUtmbIndex(toProfileUrl(utmbUrl));
			if (result.ok) {
				setUtmbIndex(result.index);
				setUtmbName(result.name);
				if (result.recentRaceName) setRecentRaceName(result.recentRaceName);
				if (result.recentRaceRecord) setRecentRaceRecord(result.recentRaceRecord);
				setMessage(null);
				setIsError(false);
			} else {
				setUtmbIndex(null);
				setUtmbName("");
				setMessage(result.error);
				setIsError(true);
			}
		} catch {
			setMessage("조회 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
			setIsError(true);
		} finally {
			setFetching(false);
		}
	};

	const handleSave = async () => {
		if (!utmbUrl.trim()) {
			setMessage("번호와 이름을 입력해 주세요.");
			setIsError(true);
			return;
		}
		if (utmbIndex === null) {
			setMessage("먼저 '조회' 버튼으로 UTMB Index를 가져와 주세요.");
			setIsError(true);
			return;
		}
		setSaving(true);
		setMessage(null);
		const fullUrl = toProfileUrl(utmbUrl);
		const trimmedRaceName = recentRaceName.trim() || null;
		const trimmedRaceRecord = recentRaceRecord.trim() || null;
		try {
			const result = await saveUtmbProfile({
				profileUrl: fullUrl,
				utmbIndex,
				recentRaceName: trimmedRaceName,
				recentRaceRecord: trimmedRaceRecord,
			});
			if (!result.ok) {
				setMessage(result.message);
				setIsError(true);
				return;
			}
			onSaved({
				utmb_profile_url: fullUrl,
				utmb_index: utmbIndex,
				recent_race_name: trimmedRaceName,
				recent_race_record: trimmedRaceRecord,
			});
			onOpenChange(false);
		} catch {
			setMessage("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
			setIsError(true);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!window.confirm("UTMB Index 정보를 삭제하시겠습니까?")) return;
		setSaving(true);
		try {
			const result = await deleteUtmbProfile();
			if (!result.ok) {
				setMessage(result.message);
				setIsError(true);
				return;
			}
			onSaved(null);
			onOpenChange(false);
		} catch {
			setMessage("삭제 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
			setIsError(true);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>UTMB Index</DialogTitle>
					<DialogDescription>
						UTMB 프로필 번호와 이름을 입력하세요.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<div className="flex gap-2">
							<Input
								placeholder="123456.gildong.hong"
								value={utmbUrl}
								onChange={(e) => {
									setUtmbUrl(e.target.value);
									setUtmbIndex(null);
									setUtmbName("");
								}}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="outline"
								onClick={handleFetch}
								disabled={fetching}
								className="shrink-0 border-[1.5px]"
							>
								{fetching ? "조회 중..." : utmb ? "새로고침" : "조회"}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							utmb.world 프로필의 번호.이름 형식으로 입력하세요.
						</p>
						{utmbIndex === null && (
							<a
								href="https://utmb.world/utmb-index/runner-search"
								target="_blank"
								rel="noopener noreferrer"
								className="text-xs font-medium text-primary underline"
							>
								내 UTMB 프로필 찾기
							</a>
						)}
					</div>

					{utmbIndex !== null && (
						<div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-border p-4">
							<div className="flex items-baseline justify-between">
								<div className="flex items-baseline gap-2">
									<span className="font-mono text-2xl font-bold text-foreground">
										{utmbIndex}
									</span>
									{utmbName && (
										<span className="text-sm text-muted-foreground">
											{utmbName}
										</span>
									)}
								</div>
								<a
									href={toProfileUrl(utmbUrl)}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-primary underline"
								>
									프로필 보기
								</a>
							</div>
							{recentRaceName && (
								<div className="flex flex-col gap-0.5 border-t border-border pt-3">
									<span className="text-xs text-muted-foreground">최근 대회</span>
									<span className="truncate text-sm font-medium text-foreground">
										{recentRaceName}
									</span>
									{recentRaceRecord && (
										<span className="font-mono text-xs text-muted-foreground">
											{recentRaceRecord}
										</span>
									)}
								</div>
							)}
						</div>
					)}

					{message && (
						<p
							className={
								isError ? "text-sm text-destructive" : "text-sm text-success"
							}
						>
							{message}
						</p>
					)}

					<div className="flex gap-2">
						<Button
							type="button"
							onClick={handleSave}
							disabled={saving}
							className="h-12 flex-1 rounded-xl font-semibold"
						>
							{saving ? "저장 중..." : "저장"}
						</Button>
						{utmb && (
							<Button
								type="button"
								variant="outline"
								onClick={handleDelete}
								disabled={saving}
								className="h-12 rounded-xl border-[1.5px] px-4 text-destructive hover:text-destructive"
							>
								삭제
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
