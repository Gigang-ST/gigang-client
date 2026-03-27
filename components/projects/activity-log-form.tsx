"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SPORT_LABELS, type Sport, calcBaseMileage, calcFinalMileage } from "@/lib/mileage";
import { logActivity, updateActivity } from "@/app/actions/mileage-run";
import { createClient } from "@/lib/supabase/client";

type EventMultiplier = {
  id: string;
  name: string;
  multiplier: number;
};

type FormValues = {
  activityDate: string;
  sport: Sport;
  distanceKm: string;
  elevationM: string;
  review: string;
};

type Props = {
  participationId: string;
  projectId: string;
  defaultValues?: FormValues & { id: string; eventMultiplierIds: string[] };
  onSuccess: () => void;
};

export function ActivityLogForm({
  participationId,
  projectId,
  defaultValues,
  onSuccess,
}: Props) {
  const [events, setEvents] = useState<EventMultiplier[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    defaultValues?.eventMultiplierIds ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMileage, setPreviewMileage] = useState<number>(0);

  const today = process.env.NEXT_PUBLIC_DEBUG_DATE
    ? new Date(process.env.NEXT_PUBLIC_DEBUG_DATE).toLocaleDateString("sv")
    : new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" });

  const { register, handleSubmit, watch, control } = useForm<FormValues>({
    defaultValues: defaultValues ?? {
      activityDate: today,
      sport: "running",
      distanceKm: "",
      elevationM: "0",
      review: "",
    },
  });

  const sport = watch("sport");
  const distanceKm = watch("distanceKm");
  const elevationM = watch("elevationM");

  // 활성 이벤트 로드
  useEffect(() => {
    createClient()
      .from("event_multiplier")
      .select("id, name, multiplier")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .then(({ data }) => setEvents(data ?? []));
  }, [projectId]);

  // 마일리지 미리보기
  useEffect(() => {
    const dist = parseFloat(distanceKm ?? "0") || 0;
    const elev = parseInt(elevationM ?? "0") || 0;
    if (dist > 0) {
      const base = calcBaseMileage(sport, dist, elev);
      const multipliers = events
        .filter((e) => selectedEvents.includes(e.id))
        .map((e) => e.multiplier);
      setPreviewMileage(calcFinalMileage(base, multipliers));
    } else {
      setPreviewMileage(0);
    }
  }, [sport, distanceKm, elevationM, selectedEvents, events]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        participationId,
        activityDate: values.activityDate,
        sport: values.sport,
        distanceKm: parseFloat(values.distanceKm),
        elevationM: parseInt(values.elevationM) || 0,
        eventMultiplierIds: selectedEvents,
        review: values.review || undefined,
      };
      const result = defaultValues?.id
        ? await updateActivity(defaultValues.id, input)
        : await logActivity(input);

      if (result.error) {
        setError(result.error);
      } else {
        onSuccess();
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="activityDate">날짜</Label>
        <Input
          id="activityDate"
          type="date"
          max={today}
          {...register("activityDate", { required: true })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sport">종목</Label>
        <Controller
          control={control}
          name="sport"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="sport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SPORT_LABELS) as [Sport, string][]).map(
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="distanceKm">거리 (km)</Label>
        <Input
          id="distanceKm"
          type="number"
          step="0.1"
          min="0.1"
          placeholder="예: 10.5"
          {...register("distanceKm", { required: true })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="elevationM">상승고도 (m, 선택)</Label>
        <Input
          id="elevationM"
          type="number"
          step="1"
          min="0"
          placeholder="예: 200"
          {...register("elevationM")}
        />
      </div>

      {events.length > 0 && (
        <div className="space-y-2">
          <Label>이벤트 배율 (선택)</Label>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="flex items-center gap-2">
                <Checkbox
                  id={event.id}
                  checked={selectedEvents.includes(event.id)}
                  onCheckedChange={(checked) =>
                    setSelectedEvents((prev) =>
                      checked
                        ? [...prev, event.id]
                        : prev.filter((id) => id !== event.id),
                    )
                  }
                />
                <Label htmlFor={event.id} className="font-normal cursor-pointer">
                  {event.name} (x{event.multiplier})
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewMileage > 0 && (
        <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          예상 마일리지: {previewMileage.toFixed(2)} km
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="review">후기 (선택)</Label>
        <Textarea
          id="review"
          placeholder="한 줄 후기"
          rows={2}
          {...register("review")}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "저장 중..." : defaultValues?.id ? "수정하기" : "기록하기"}
      </Button>
    </form>
  );
}
