"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { activityLogSchema } from "@/lib/validations/mileage";
import type { z } from "zod";

// RHF는 스키마 input 타입(default 미적용) 기준으로 동작
type FormValues = z.input<typeof activityLogSchema>;
import {
  calcBaseMileage,
  calcFinalMileage,
  roundMileage,
  MILEAGE_SPORT_LABELS,
  type MileageSport,
} from "@/lib/mileage";
import { todayKST } from "@/lib/dayjs";
import { logActivity, updateActivity, type ActivityLogInput } from "@/app/actions/mileage-run";
import { createClient } from "@/lib/supabase/client";

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
  };
  onSuccess: () => void;
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
}: ActivityLogFormProps) {
  const today = todayKST();

  // editData에서 선택된 배율 ID 추출
  const initialMultIds =
    editData?.applied_mults?.map((m) => m.mult_id) ?? [];

  const [multipliers, setMultipliers] = useState<EventMultiplier[]>([]);
  const [selectedMultIds, setSelectedMultIds] = useState<string[]>(initialMultIds);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      // 서버 액션 타입으로 변환 (default 값 명시 적용)
      const input: ActivityLogInput = {
        act_dt: values.act_dt,
        sprt_enm: values.sprt_enm as MileageSport,
        distance_km: values.distance_km as number,
        elevation_m: values.elevation_m ?? 0,
        applied_mult_ids: selectedMultIds,
        review: values.review?.trim() || null,
      };

      const result = editData?.act_id
        ? await updateActivity(editData.act_id, input)
        : await logActivity(evtId, input);

      if (!result.ok) {
        alert(result.message ?? "오류가 발생했습니다.");
      } else {
        onSuccess();
      }
    } catch {
      alert("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 pb-4">
      {/* 날짜 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="act_dt">날짜</Label>
        <Input
          id="act_dt"
          type="date"
          max={today}
          className="date-no-icon h-12 rounded-xl border-[1.5px] pr-3 text-[15px]"
          {...register("act_dt")}
        />
        {errors.act_dt && (
          <p className="text-sm text-destructive">{errors.act_dt.message}</p>
        )}
      </div>

      {/* 종목 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sprt_enm">종목</Label>
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
        <Label htmlFor="distance_km">거리 (km)</Label>
        <Input
          id="distance_km"
          type="number"
          step="0.1"
          min="0.1"
          placeholder="예: 10.5"
          className="h-12 rounded-xl border-[1.5px] text-[15px]"
          {...register("distance_km", { valueAsNumber: true })}
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

      {/* 저장 버튼 */}
      <Button
        type="submit"
        disabled={submitting}
        className="h-[52px] w-full rounded-xl text-base font-semibold"
      >
        {submitting ? "저장 중..." : editData?.act_id ? "수정하기" : "기록하기"}
      </Button>
    </form>
  );
}
