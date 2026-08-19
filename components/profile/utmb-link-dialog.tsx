"use client";

import { useState } from "react";

import {
	deleteUtmbProfile,
	saveUtmbProfile,
} from "@/app/actions/save-utmb-profile";
import { fetchUtmbIndex } from "@/app/actions/utmb";

import { cn } from "@/lib/utils";

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
 * 원래 `PersonalBestGrid` 안에 붙어 있던 폼을 떼어낸 것이다. 기록 칸이 프로필 카드 안으로
 * 들어가면서 그리드는 사라졌지만 이 폼은 그대로 쓰인다 — 카드의 `UTMB INDEX` 줄에서
 * 미연동이면 `연동하기` pill, 연동됐으면 라벨 옆 연필로 열린다.
 *
 * **한 판이 두 모드로 갈린다**(`refreshMode`): 이미 연동돼 있고 주소를 안 건드렸으면
 * `갱신` 하나로 조회+저장이 끝나고, 신규거나 주소를 바꿨으면 `조회` → 확인 → `저장`으로
 * 나뉜다. 전자는 "같은 사람의 최신 지수"라 확인할 게 없고, 후자는 *다른 사람*을 연동하는
 * 길이라 눈으로 보고 굳혀야 하기 때문이다.
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

	/**
	 * 지금 입력값이 저장된 연동과 다른가.
	 *
	 * **short id로 정규화해서 비교한다** — 저장된 URL이 `/en/runner/`와 `/runner/` 두 형식으로
	 * 섞여 있어(prd 실측 13건에 둘 다 존재), 전체 URL을 맞대면 열자마자 "주소를 바꿨다"로
	 * 오판해 갱신 버튼이 조회로 둔갑한다.
	 */
	const isDirty =
		!utmb || toShortId(utmbUrl.trim()) !== toShortId(utmb.utmb_profile_url);

	/**
	 * 갱신 모드 — 이미 연동돼 있고 주소를 건드리지 않았다.
	 *
	 * 이때 할 일은 "같은 사람의 최신 지수를 다시 긁어오기" 하나뿐이라 **조회+저장을 한 번에**
	 * 끝낸다. 주소를 바꿨거나 신규면 *다른 사람*을 연동하는 것이므로 조회 → 확인 → 저장으로
	 * 나눈다 — 엉뚱한 프로필을 확인 없이 굳히지 않게.
	 */
	const refreshMode = utmb !== null && !isDirty;

	/** 저장 + 부모 상태 반영 — 조회·갱신 두 경로가 공유한다(한쪽만 고쳐 어긋나지 않게) */
	const persist = async (
		index: number,
		raceName: string | null,
		raceRecord: string | null,
	) => {
		const fullUrl = toProfileUrl(utmbUrl);
		const result = await saveUtmbProfile({
			profileUrl: fullUrl,
			utmbIndex: index,
			recentRaceName: raceName,
			recentRaceRecord: raceRecord,
		});
		if (result.ok) {
			onSaved({
				utmb_profile_url: fullUrl,
				utmb_index: index,
				recent_race_name: raceName,
				recent_race_record: raceRecord,
			});
		}
		return result;
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
			if (!result.ok) {
				setUtmbIndex(null);
				setUtmbName("");
				setMessage(result.error);
				setIsError(true);
				return;
			}

			setUtmbIndex(result.index);
			setUtmbName(result.name);
			if (result.recentRaceName) setRecentRaceName(result.recentRaceName);
			if (result.recentRaceRecord) setRecentRaceRecord(result.recentRaceRecord);
			setIsError(false);

			if (!refreshMode) {
				// 조회 모드 — 여기서 멈춘다. 다른 사람을 연동하는 길이라 눈으로 확인한 뒤 저장한다.
				setMessage(null);
				return;
			}

			// 갱신 모드 — `갱신`은 완결형 어휘라 **저장까지 끝내야** 한다. 긁어오기만 하고
			// 멈추면 사용자는 끝난 줄 알고 닫고, 값은 옛것 그대로 남는다(라벨만 바꾸면 생기는 함정).
			// 최근 대회는 파싱 실패 시 null이 오므로 있던 값을 지우지 않게 폴백한다.
			const before = utmb?.utmb_index ?? null;
			const nextRaceName =
				(result.recentRaceName ?? recentRaceName).trim() || null;
			const nextRaceRecord =
				(result.recentRaceRecord ?? recentRaceRecord).trim() || null;
			const saved = await persist(result.index, nextRaceName, nextRaceRecord);
			if (!saved.ok) {
				setMessage(saved.message);
				setIsError(true);
				return;
			}
			setMessage(
				before !== null && before !== result.index
					? `${before} → ${result.index}로 갱신했어요`
					: `이미 최신이에요 (${result.index})`,
			);
		} catch {
			setMessage(
				`${refreshMode ? "갱신" : "조회"} 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.`,
			);
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
		try {
			const result = await persist(
				utmbIndex,
				recentRaceName.trim() || null,
				recentRaceRecord.trim() || null,
			);
			if (!result.ok) {
				setMessage(result.message);
				setIsError(true);
				return;
			}
			onOpenChange(false);
		} catch {
			setMessage("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
			setIsError(true);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		// "삭제"보다 "연동 해제"가 맞는 말이다 — 지우는 건 내 기록이 아니라 utmb.world와의
		// 연결이고, 실제로 전당 트레일 판에서 내려가므로 그 결과까지 미리 말해 준다.
		if (
			!window.confirm(
				"UTMB 연동을 해제할까요?\n기강의 전당 트레일 순위에서도 내려갑니다.",
			)
		)
			return;
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
						{refreshMode
							? "최신 지수를 다시 가져오거나 연동을 해제할 수 있어요."
							: "UTMB 프로필 번호와 이름을 입력하세요."}
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
								disabled={fetching || saving}
								className="shrink-0 border-[1.5px]"
							>
								{/* 라벨이 곧 그 버튼이 끝내는 일이다 — `갱신`은 조회+저장을 한 번에
								    끝내고, `조회`는 확인 단계로만 데려간다(뒤에 `저장`이 선다).
								    주소를 건드리는 순간 다른 사람을 연동하는 길이므로 `조회`로 돌아간다. */}
								{fetching
									? refreshMode
										? "갱신 중..."
										: "조회 중..."
									: refreshMode
										? "갱신"
										: "조회"}
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

					{/* 갱신 모드엔 `저장`을 세우지 않는다 — `갱신`이 이미 저장까지 끝냈으므로
					    저장할 게 없고, 남겨 두면 "갱신하고 저장도 눌러야 하나"를 매번 묻게 된다.
					    그래서 이때 아래 줄엔 `연동 해제`만 남는데, 파괴적 행동을 전폭으로 세우면
					    이 판의 주인공이 되므로 오른쪽 끝에 원래 크기로 둔다. */}
					<div className={cn("flex gap-2", refreshMode && "justify-end")}>
						{!refreshMode && (
							<Button
								type="button"
								onClick={handleSave}
								disabled={saving || fetching}
								className="h-12 flex-1 rounded-xl font-semibold"
							>
								{saving ? "저장 중..." : "저장"}
							</Button>
						)}
						{utmb && (
							<Button
								type="button"
								variant="outline"
								onClick={handleDelete}
								disabled={saving || fetching}
								className="h-12 rounded-xl border-[1.5px] px-4 text-destructive hover:text-destructive"
							>
								연동 해제
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
