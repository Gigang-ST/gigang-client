"use client";

import { useState, useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";

import { todayKST } from "@/lib/dayjs";
import {
  calcBaseMileage,
  calcFinalMileage,
  roundMileage,
  MILEAGE_SPORT_LABELS,
  type MileageSport,
} from "@/lib/mileage";
import { createClient } from "@/lib/supabase/client";
import { activityLogSchema } from "@/lib/validations/mileage";

import {
  logActivity,
  updateActivity,
  uploadActivityPhoto,
  type ActivityLogInput,
} from "@/app/actions/mileage-run";

import { InactiveGateDialog } from "@/components/common/inactive-gate-dialog";
import { PhotoPicker } from "@/components/common/photo-picker";
import { RequiredMark } from "@/components/common/required-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


import type { z } from "zod";

// RHF는 스키마 input 타입(default 미적용) 기준으로 동작
type FormValues = z.input<typeof activityLogSchema>;



// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

type EventMultiplier = {
  mult_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
};

export type ActivityLogFormProps = {
  evtId: string;
  memId: string;
  editData?: {
    act_id: string;
    act_dt: string;
    sprt_enm: string;
    distance_km: number;
    elevation_m: number | null;
    applied_mults: { mult_id: string; mult_nm: string; mult_val: number }[] | null;
    review: string | null;
    /** 이미 올라가 있는 사진(있으면 수정 화면에서 미리보기로 뜬다) */
    photo_url?: string | null;
  };
  onSuccess: () => void;
  /** 비활성/탈퇴 회원 — true면 저장 시도 시 공통 안내 게이트를 연다 */
  isInactive?: boolean;
  /** 비활성/탈퇴 세부 구분 — InactiveGateDialog 문구 분기용 */
  inactiveKind?: "inactive" | "left";
};

// ─────────────────────────────────────────
// 배율 날짜 범위 필터
// stt_dt/end_dt가 null이면 상시 적용
// ─────────────────────────────────────────

function isMultiplierActive(mult: EventMultiplier, actDt: string): boolean {
  if (mult.stt_dt && actDt < mult.stt_dt) return false;
  if (mult.end_dt && actDt > mult.end_dt) return false;
  return true;
}

// ─────────────────────────────────────────
// 폼 컴포넌트
// ─────────────────────────────────────────

export function ActivityLogForm({
  evtId,
  memId: _memId,
  editData,
  onSuccess,
  isInactive = false,
  inactiveKind,
}: ActivityLogFormProps) {
  const today = todayKST();

  // editData에서 선택된 배율 ID 추출
  const initialMultIds =
    editData?.applied_mults?.map((m) => m.mult_id) ?? [];

  const [multipliers, setMultipliers] = useState<EventMultiplier[]>([]);
  const [selectedMultIds, setSelectedMultIds] = useState<string[]>(initialMultIds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactiveGateOpen, setInactiveGateOpen] = useState(false);

  // 사진 — 새로 고른 파일과 "이미 올라가 있던 URL"을 따로 든다.
  // 수정 화면에서 셋이 갈린다: 파일 있음=교체, 파일 없고 URL 있음=그대로, 둘 다 없음=지움.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(editData?.photo_url ?? null);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(activityLogSchema),
    defaultValues: {
      act_dt: editData?.act_dt ?? today,
      sprt_enm: (editData?.sprt_enm as MileageSport) ?? "RUNNING",
      distance_km: editData?.distance_km ?? (undefined as unknown as number),
      elevation_m: editData?.elevation_m ?? 0,
      applied_mult_ids: initialMultIds,
      review: editData?.review ?? "",
    },
  });

  const sprtEnm = watch("sprt_enm");
  const distanceKm = watch("distance_km");
  const elevationM = watch("elevation_m");
  const actDt = watch("act_dt");

  // ── 배율 목록 fetch ──

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("evt_mlg_mult_cfg")
      .select("mult_id, mult_nm, mult_val, stt_dt, end_dt")
      .eq("evt_id", evtId)
      .eq("active_yn", true)
      .then(({ data }) => setMultipliers(data ?? []));
  }, [evtId]);

  // 날짜 변경 시 범위 벗어난 배율 선택 해제
  useEffect(() => {
    setSelectedMultIds((prev) => {
      const filtered = prev.filter((id) => {
        const mult = multipliers.find((m) => m.mult_id === id);
        return mult ? isMultiplierActive(mult, actDt) : false;
      });
      return filtered.length !== prev.length ? filtered : prev;
    });
  }, [actDt, multipliers]);

  // ── 마일리지 미리보기 ──

  const activeMults = multipliers.filter(
    (m) => selectedMultIds.includes(m.mult_id) && isMultiplierActive(m, actDt),
  );

  const dist = Number(distanceKm) || 0;
  const elev = Number(elevationM) || 0;
  const baseMileage = dist > 0 ? roundMileage(calcBaseMileage(sprtEnm, dist, elev)) : 0;
  const finalMileage =
    dist > 0
      ? roundMileage(calcFinalMileage(baseMileage, activeMults.map((m) => m.mult_val)))
      : 0;

  // ── 현재 날짜 기준 활성 배율만 체크박스 표시 ──

  const visibleMultipliers = multipliers.filter((m) => isMultiplierActive(m, actDt));

  // ── 제출 ──

  const onSubmit = handleSubmit(async (values) => {
    if (isInactive) {
      setInactiveGateOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      // 사진을 새로 골랐으면 먼저 올려 URL을 받는다 — 기록 저장은 JSON 액션이라
      // 파일을 실을 수 없어서다(자세한 이유는 uploadActivityPhoto 주석).
      // 업로드가 실패하면 기록도 저장하지 않는다: 사진을 올린 줄 알았는데 조용히 빠지면
      // 기강이야기에 안 뜨는 이유를 사용자가 알 길이 없다.
      let nextPhotoUrl = photoUrl;
      if (photoFile) {
        const fd = new FormData();
        fd.set("photo", photoFile);
        const uploaded = await uploadActivityPhoto(fd);
        if (!uploaded.ok) {
          setError(uploaded.message);
          return;
        }
        nextPhotoUrl = uploaded.url;
      }

      // 서버 액션 타입으로 변환 (default 값 명시 적용)
      const input: ActivityLogInput = {
        act_dt: values.act_dt,
        sprt_enm: values.sprt_enm as MileageSport,
        distance_km: values.distance_km as number,
        elevation_m: values.elevation_m ?? 0,
        applied_mult_ids: selectedMultIds,
        review: values.review?.trim() || null,
        photo_url: nextPhotoUrl,
      };

      const result = editData?.act_id
        ? await updateActivity(editData.act_id, input)
        : await logActivity(evtId, input);

      if (!result.ok) {
        setError(result.message ?? "오류가 발생했습니다.");
      } else {
        setError(null);
        onSuccess();
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
    <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
      {/* 날짜 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="act_dt">
          날짜
          <RequiredMark />
        </Label>
        <Input
          id="act_dt"
          type="date"
          max={today}
          className="date-stable h-12 rounded-xl border-[1.5px] pr-3"
          {...register("act_dt")}
        />
        {errors.act_dt && (
          <p className="text-sm text-destructive">{errors.act_dt.message}</p>
        )}
      </div>

      {/* 종목 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sprt_enm">
          종목
          <RequiredMark />
        </Label>
        <Controller
          control={control}
          name="sprt_enm"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="sprt_enm"
                className="h-12 rounded-xl border-[1.5px] text-[15px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(MILEAGE_SPORT_LABELS) as [MileageSport, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        />
        {errors.sprt_enm && (
          <p className="text-sm text-destructive">{errors.sprt_enm.message}</p>
        )}
      </div>

      {/* 거리 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="distance_km">
          거리 (km)
          <RequiredMark />
        </Label>
        <Input
          id="distance_km"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="예: 10.55"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
          {...register("distance_km", { valueAsNumber: true })}
          onInput={(e) => {
            const val = e.currentTarget.value;
            const dot = val.indexOf(".");
            if (dot !== -1 && val.length - dot > 3) {
              e.currentTarget.value = val.slice(0, dot + 3);
            }
          }}
        />
        {errors.distance_km && (
          <p className="text-sm text-destructive">{errors.distance_km.message}</p>
        )}
      </div>

      {/* 상승고도 — 수영 선택 시 hidden */}
      {sprtEnm !== "SWIMMING" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="elevation_m">상승고도 (m, 선택)</Label>
          <Input
            id="elevation_m"
            type="number"
            step="1"
            min="0"
            placeholder="예: 200"
            className="h-12 rounded-xl border-[1.5px] text-[15px]"
            {...register("elevation_m", { valueAsNumber: true })}
          />
        </div>
      )}

      {/* 이벤트 배율 체크박스 */}
      {visibleMultipliers.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>이벤트 배율 (선택)</Label>
          <div className="flex flex-col gap-2">
            {visibleMultipliers.map((mult) => (
              <label
                key={mult.mult_id}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary rounded"
                  checked={selectedMultIds.includes(mult.mult_id)}
                  onChange={(e) =>
                    setSelectedMultIds((prev) =>
                      e.target.checked
                        ? [...prev, mult.mult_id]
                        : prev.filter((id) => id !== mult.mult_id),
                    )
                  }
                />
                <span className="text-[15px]">
                  {mult.mult_nm}{" "}
                  <span className="text-muted-foreground text-[13px]">
                    (×{mult.mult_val})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 마일리지 미리보기 */}
      {dist > 0 && (
        <div className="rounded-xl bg-primary/10 px-4 py-3 text-[14px] font-medium text-primary">
          {activeMults.length > 0 ? (
            <>기본: {baseMileage.toFixed(1)} → 최종: {finalMileage.toFixed(1)} km</>
          ) : (
            <>마일리지: {baseMileage.toFixed(1)} km</>
          )}
        </div>
      )}

      {/* 후기 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review">후기 (선택, 최대 200자)</Label>
        <Input
          id="review"
          type="text"
          maxLength={200}
          placeholder="한 줄 후기를 남겨보세요"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
          {...register("review")}
        />
      </div>

      {/* 사진 — 마일리지런은 수치가 본체라 선택값이다. 다만 올리면 기강이야기에도 함께 선다 */}
      <div className="flex flex-col gap-1.5">
        <Label>사진 (선택)</Label>
        <PhotoPicker
          onPick={(f) => {
            setPhotoFile(f);
            // 지우기를 누르면 이미 올라가 있던 사진도 함께 뗀다 —
            // 안 그러면 미리보기만 사라지고 저장 시 옛 사진이 되살아난다
            if (!f) setPhotoUrl(null);
          }}
          initialUrl={photoUrl}
          emptyLabel="사진 추가 (선택)"
        />
        {/* 사진이 곧 기강이야기 유입 스위치라, 누르기 전에 알려 준다.
            "올리면 다른 데도 뜬다"는 건 되돌리기 어려운 공개라 사후 안내로는 늦다.
            색은 primary — 안내이지 오류가 아니다. destructive를 쓰면 같은 화면의 실제
            오류 메시지와 구분이 안 돼 입력이 잘못된 줄로 읽힌다(다건 폼과 동일 규칙). */}
        <p className="text-[13px] text-primary">
          사진 추가 시, 기강이야기의 깅스타그램에도 등록돼요.
        </p>
      </div>

      {/* 저장 버튼 */}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={submitting}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {submitting ? "저장 중..." : editData?.act_id ? "수정하기" : "기록하기"}
      </Button>
    </form>

    <InactiveGateDialog open={inactiveGateOpen} onOpenChange={setInactiveGateOpen} kind={inactiveKind} />
    </>
  );
}
