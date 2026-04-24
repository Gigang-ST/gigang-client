"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  calcBaseMileage,
  calcFinalMileage,
  MILEAGE_SPORT_LABELS,
  roundMileage,
  type MileageSport,
} from "@/lib/mileage";
import { todayKST } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";
import {
  logActivitiesBatch,
  type ActivityLogInput,
} from "@/app/actions/mileage-run";

type EventMultiplier = {
  mult_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
};

type ActivityDraft = {
  id: string;
  act_dt: string;
  sprt_enm: MileageSport;
  distance_km: string;
  elevation_m: string;
  applied_mult_ids: string[];
  review: string;
};

type ActivityLogBatchFormProps = {
  evtId: string;
  onSuccess: () => void;
};

function isMultiplierActive(mult: EventMultiplier, actDt: string): boolean {
  if (mult.stt_dt && actDt < mult.stt_dt) return false;
  if (mult.end_dt && actDt > mult.end_dt) return false;
  return true;
}

function createDraft(today: string): ActivityDraft {
  return {
    id: crypto.randomUUID(),
    act_dt: today,
    sprt_enm: "RUNNING",
    distance_km: "",
    elevation_m: "0",
    applied_mult_ids: [],
    review: "",
  };
}

export function ActivityLogBatchForm({ evtId, onSuccess }: ActivityLogBatchFormProps) {
  const today = todayKST();
  const [multipliers, setMultipliers] = useState<EventMultiplier[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [initialDraft] = useState<ActivityDraft>(() => createDraft(today));
  const [drafts, setDrafts] = useState<ActivityDraft[]>([initialDraft]);
  const [expandedId, setExpandedId] = useState<string>(initialDraft.id);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("evt_mlg_mult_cfg")
      .select("mult_id, mult_nm, mult_val, stt_dt, end_dt")
      .eq("evt_id", evtId)
      .eq("active_yn", true)
      .then(({ data }) => setMultipliers(data ?? []));
  }, [evtId]);

  const totalPreview = useMemo(() => {
    return drafts.reduce((sum, d) => {
      const dist = Number(d.distance_km) || 0;
      const elev = d.sprt_enm === "SWIMMING" ? 0 : Number(d.elevation_m) || 0;
      if (dist <= 0) return sum;
      const activeVals = multipliers
        .filter(
          (m) =>
            d.applied_mult_ids.includes(m.mult_id) && isMultiplierActive(m, d.act_dt),
        )
        .map((m) => Number(m.mult_val));
      const base = roundMileage(calcBaseMileage(d.sprt_enm, dist, elev));
      const final = roundMileage(calcFinalMileage(base, activeVals));
      return sum + final;
    }, 0);
  }, [drafts, multipliers]);

  function updateDraft(id: string, patch: Partial<ActivityDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addDraft() {
    const next = createDraft(today);
    setDrafts((prev) => [...prev, next]);
    setExpandedId(next.id);
  }

  function removeDraft(id: string) {
    setDrafts((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((d) => d.id !== id);
      if (expandedId === id && next.length > 0) {
        setExpandedId(next[next.length - 1].id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    const payload: ActivityLogInput[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const dist = Number(d.distance_km);
      const elev = d.sprt_enm === "SWIMMING" ? 0 : Number(d.elevation_m || "0");
      if (!d.act_dt || !Number.isFinite(dist) || dist <= 0) {
        alert(`${i + 1}번째 기록의 날짜/거리를 확인해 주세요.`);
        return;
      }
      if (!Number.isFinite(elev) || elev < 0) {
        alert(`${i + 1}번째 기록의 상승고도를 확인해 주세요.`);
        return;
      }
      payload.push({
        act_dt: d.act_dt,
        sprt_enm: d.sprt_enm,
        distance_km: dist,
        elevation_m: elev,
        applied_mult_ids: d.applied_mult_ids,
        review: d.review.trim() || null,
      });
    }

    setSubmitting(true);
    try {
      const result = await logActivitiesBatch(evtId, payload);
      if (!result.ok) {
        alert(result.message ?? "오류가 발생했습니다.");
        return;
      }
      onSuccess();
    } catch {
      alert("오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {drafts.map((d, idx) => {
        const isExpanded = d.id === expandedId;
        const visibleMultipliers = multipliers.filter((m) =>
          isMultiplierActive(m, d.act_dt),
        );
        const dist = Number(d.distance_km) || 0;
        const elev = d.sprt_enm === "SWIMMING" ? 0 : Number(d.elevation_m) || 0;
        const activeMults = multipliers.filter(
          (m) =>
            d.applied_mult_ids.includes(m.mult_id) && isMultiplierActive(m, d.act_dt),
        );
        const base = dist > 0 ? roundMileage(calcBaseMileage(d.sprt_enm, dist, elev)) : 0;
        const final =
          dist > 0
            ? roundMileage(calcFinalMileage(base, activeMults.map((m) => m.mult_val)))
            : 0;

        return (
          <div key={d.id} className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <button
                type="button"
                className="text-left"
                onClick={() => setExpandedId(d.id)}
              >
                <p className="text-sm font-semibold">기록 {idx + 1}</p>
                <p className="text-xs text-muted-foreground">
                  {d.act_dt || "날짜 미입력"} · {MILEAGE_SPORT_LABELS[d.sprt_enm]} ·{" "}
                  {dist > 0 ? `${dist.toFixed(1)}km` : "거리 미입력"} ·{" "}
                  {dist > 0 ? `최종 ${final.toFixed(1)}` : "최종 0.0"}
                </p>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDraft(d.id)}
                  disabled={drafts.length === 1 || submitting}
                >
                  삭제
                </Button>
              </div>
            </div>

            {isExpanded && (
              <>
                <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">날짜</Label>
                <Input
                  type="date"
                  max={today}
                  value={d.act_dt}
                  onChange={(e) => updateDraft(d.id, { act_dt: e.target.value })}
                  className="date-stable date-stable-xs h-10 rounded-lg border pr-3"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">종목</Label>
                <Select
                  value={d.sprt_enm}
                  onValueChange={(value) =>
                    updateDraft(d.id, { sprt_enm: value as MileageSport })
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg border text-sm">
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
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">거리 (km)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="예: 10.5"
                  value={d.distance_km}
                  onChange={(e) => updateDraft(d.id, { distance_km: e.target.value })}
                  className="h-10 rounded-lg border text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">
                  상승고도 (m{d.sprt_enm === "SWIMMING" ? ", 수영 제외" : ""})
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={d.sprt_enm === "SWIMMING" ? "0" : d.elevation_m}
                  disabled={d.sprt_enm === "SWIMMING"}
                  onChange={(e) => updateDraft(d.id, { elevation_m: e.target.value })}
                  className="h-10 rounded-lg border text-sm"
                />
              </div>
                </div>

                {dist > 0 && (
                  <div className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                    {activeMults.length > 0 ? (
                      <>기본 {base.toFixed(1)} → 최종 {final.toFixed(1)} km</>
                    ) : (
                      <>마일리지 {base.toFixed(1)} km</>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              {visibleMultipliers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">이벤트 배율 (선택)</Label>
                  <div className="flex flex-col gap-2">
                    {visibleMultipliers.map((mult) => {
                      const checked = d.applied_mult_ids.includes(mult.mult_id);
                      return (
                        <label key={mult.mult_id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary rounded"
                            checked={checked}
                            onChange={(e) =>
                              updateDraft(d.id, {
                                applied_mult_ids: e.target.checked
                                  ? [...d.applied_mult_ids, mult.mult_id]
                                  : d.applied_mult_ids.filter((id) => id !== mult.mult_id),
                              })
                            }
                          />
                          <span className="text-sm">
                            {mult.mult_nm}{" "}
                            <span className="text-muted-foreground text-xs">
                              (×{mult.mult_val})
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label className="text-xs">후기 (선택, 최대 200자)</Label>
                <Input
                  type="text"
                  maxLength={200}
                  placeholder="한 줄 후기를 남겨보세요"
                  value={d.review}
                  onChange={(e) => updateDraft(d.id, { review: e.target.value })}
                  className="h-10 rounded-lg border text-sm"
                />
              </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="sticky bottom-0 z-10 mt-1 rounded-xl border border-border bg-background p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          총 예상 마일리지 {totalPreview.toFixed(1)} km
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            onClick={addDraft}
            disabled={drafts.length >= 20 || submitting}
          >
            + 기록 추가
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 rounded-xl"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "저장 중..." : `${drafts.length}건 저장`}
          </Button>
        </div>
      </div>
    </div>
  );
}
