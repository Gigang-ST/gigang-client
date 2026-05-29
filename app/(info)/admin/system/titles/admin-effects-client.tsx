"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toggleEffectUseYn, updateEffectLevel } from "@/app/actions/admin/manage-effect";

// 배지 이펙트 CSS 클래스 매핑
const BADGE_CSS: Record<string, string> = {
  none: "", dim: "title-effect-dim", breathe: "title-effect-breathe",
  "italic-drift": "title-effect-italic-drift", "dot-blink": "title-effect-dot-blink",
  "glow-soft": "title-effect-glow-soft", "soft-shine": "title-effect-soft-shine",
  silver: "title-effect-silver", "underline-fade": "title-effect-underline-fade",
  flare: "title-effect-flare", bronze: "title-effect-bronze", neon: "title-effect-neon",
  emerald: "title-effect-emerald", sapphire: "title-effect-sapphire",
  gold: "title-effect-gold", ice: "title-effect-ice", pearl: "title-effect-pearl",
  titanium: "title-effect-titanium", hologram: "title-effect-hologram",
  "aurora-text": "title-effect-aurora-text", "pulse-color": "title-effect-pulse-color",
  "void-text": "title-effect-void-text", ruby: "title-effect-ruby",
  amethyst: "title-effect-amethyst", fire: "title-effect-fire",
  rainbow: "title-effect-rainbow", plasma: "title-effect-plasma",
  lava: "title-effect-lava", crimson: "title-effect-crimson",
  matrix: "title-effect-matrix", glitch: "title-effect-glitch",
  chromatic: "title-effect-chromatic", wave: "title-effect-wave",
  zoom: "title-effect-zoom", bounce: "title-effect-bounce",
  shake: "title-effect-shake", flip: "title-effect-flip",
  typewriter: "title-effect-typewriter",
  "bounce-rainbow": "title-effect-bounce-rainbow", "bounce-ice": "title-effect-bounce-ice",
  "shake-fire": "title-effect-shake-fire", "wave-hologram": "title-effect-wave-hologram",
  "flip-gold": "title-effect-flip-gold", obsidian: "title-effect-obsidian",
  "shake-lava": "title-effect-shake-lava", "zoom-plasma": "title-effect-zoom-plasma",
  "zoom-rainbow": "title-effect-zoom-rainbow", "wave-fire": "title-effect-wave-fire",
  spark: "title-effect-spark",
};

// 배지 테두리 색상 매핑 (없으면 기본 border-zinc-700)
const BADGE_BORDER: Record<string, string> = {
  neon: "border-sky-400/60 text-sky-400",
  "glow-soft": "border-slate-500", "soft-shine": "border-slate-400/60",
  silver: "border-slate-400/60", "underline-fade": "border-sky-400/40",
  flare: "border-sky-400/50", bronze: "border-amber-700/60",
  emerald: "border-emerald-500/50", sapphire: "border-blue-500/50",
  gold: "border-amber-400/50", ice: "border-cyan-400/50",
  pearl: "border-slate-300/60", titanium: "border-slate-500/50",
  hologram: "border-violet-400/50", "aurora-text": "border-emerald-400/50",
  "pulse-color": "border-violet-400/50", "void-text": "border-indigo-500/50",
  ruby: "border-rose-500/50", amethyst: "border-purple-500/50",
  fire: "border-orange-500/60", rainbow: "border-pink-400/50",
  plasma: "border-fuchsia-500/50", lava: "border-red-600/60",
  crimson: "border-red-500/60", matrix: "border-green-500/50 text-green-400",
  glitch: "border-slate-500 text-slate-200", chromatic: "border-slate-500",
  wave: "border-sky-400/50", zoom: "border-fuchsia-400/50",
  bounce: "border-orange-400/50 text-orange-400",
  shake: "border-red-400/50 text-red-400",
  flip: "border-violet-400/50",
  typewriter: "border-green-400/50 text-green-400",
  "bounce-rainbow": "border-pink-400/50", "bounce-ice": "border-cyan-400/50",
  "shake-fire": "border-orange-500/60", "wave-hologram": "border-violet-400/50",
  "flip-gold": "border-amber-400/50",
  obsidian: "border-indigo-500/50",
  "shake-lava": "border-red-600/60", "zoom-plasma": "border-fuchsia-500/60",
  "zoom-rainbow": "border-pink-400/60", "wave-fire": "border-orange-500/60",
  spark: "border-violet-400/50 text-violet-300",
};

// 카드 프레임 CSS 클래스 매핑
const FRAME_CSS: Record<string, string> = {
  "frame-none": "", "frame-subtle": "card-frame-subtle",
  "frame-soft-white": "card-frame-soft-white", "frame-silver": "card-frame-silver",
  "frame-bronze": "card-frame-bronze", "frame-neon": "card-frame-neon",
  "frame-emerald": "card-frame-emerald", "frame-sapphire": "card-frame-sapphire",
  "frame-ice": "card-frame-ice", "frame-gold": "card-frame-gold",
  "frame-aurora": "card-frame-aurora", "frame-shimmer": "card-frame-shimmer",
  "frame-dusk": "card-frame-dusk", "frame-crimson": "card-frame-crimson",
  "frame-fire": "card-frame-fire", "frame-void": "card-frame-void",
  "frame-obsidian": "card-frame-obsidian", "frame-glitch": "card-frame-glitch",
  "frame-scan": "card-frame-scan", "frame-lightning": "card-frame-lightning",
  "frame-heartbeat": "card-frame-heartbeat", "frame-rainbow": "card-frame-rainbow",
  "frame-plasma": "card-frame-plasma",
};

type EffectRow = {
  effect_cd: string;
  effect_nm: string;
  effect_type: "badge" | "frame";
  rarity_level: number;
  sort_ord: number;
  use_yn: boolean;
};

const LEVEL_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}등급`,
}));

const LEVEL_COLOR: Record<number, string> = {
  1: "text-zinc-400", 2: "text-zinc-300", 3: "text-slate-300",
  4: "text-sky-400",  5: "text-amber-400", 6: "text-violet-400",
  7: "text-orange-400", 8: "text-red-400", 9: "text-fuchsia-400", 10: "text-amber-300",
};

export function AdminEffectsClient() {
  const [rows, setRows] = useState<EffectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "badge" | "frame">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("effect_mst")
      .select("effect_cd, effect_nm, effect_type, rarity_level, sort_ord, use_yn")
      .order("effect_type", { ascending: true })
      .order("rarity_level", { ascending: true })
      .order("sort_ord", { ascending: true });
    setRows((data ?? []) as EffectRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateLevel = async (effectCd: string, newLevel: number) => {
    setSaving(effectCd);
    const result = await updateEffectLevel(effectCd, newLevel);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) => r.effect_cd === effectCd ? { ...r, rarity_level: newLevel } : r)
      );
    } else {
      alert(result.message ?? "저장에 실패했습니다");
    }
    setSaving(null);
  };

  const toggleUseYn = async (effectCd: string, currentUseYn: boolean) => {
    setToggling(effectCd);
    const result = await toggleEffectUseYn(effectCd, !currentUseYn);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) => r.effect_cd === effectCd ? { ...r, use_yn: !currentUseYn } : r)
      );
    } else {
      alert(result.message ?? "저장에 실패했습니다");
    }
    setToggling(null);
  };

  const filtered = typeFilter === "all" ? rows : rows.filter((r) => r.effect_type === typeFilter);
  const badgeRows = filtered.filter((r) => r.effect_type === "badge");
  const frameRows = filtered.filter((r) => r.effect_type === "frame");

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      {/* 필터 탭 */}
      <div className="flex gap-2">
        {(["all", "badge", "frame"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              typeFilter === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? "전체" : t === "badge" ? "배지" : "프레임"}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">
          총 {filtered.length}개
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 배지 */}
          {(typeFilter === "all" || typeFilter === "badge") && badgeRows.length > 0 && (
            <div className="flex flex-col gap-2">
              {typeFilter === "all" && (
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">배지 이펙트 — {badgeRows.length}종</p>
              )}
              <CardItem className="p-0">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">이펙트</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">코드</th>
                      <th className="w-32 px-3 py-1.5 text-center font-medium text-muted-foreground">미리보기</th>
                      <th className="w-28 px-3 py-1.5 text-center font-medium text-muted-foreground">등급</th>
                      <th className="w-16 px-3 py-1.5 text-center font-medium text-muted-foreground">사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badgeRows.map((row) => {
                      const cls = BADGE_CSS[row.effect_cd] ?? "";
                      return (
                      <tr key={row.effect_cd} className={cn("border-b last:border-0 hover:bg-muted/20", !row.use_yn && "opacity-40")}>
                        <td className="px-3 py-1.5 font-medium text-foreground">{row.effect_nm}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{row.effect_cd}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={cn("inline-flex items-center rounded-full border bg-zinc-900 dark:bg-transparent px-2 py-0.5 text-[11px] font-medium", BADGE_BORDER[row.effect_cd] ?? "border-zinc-700 text-zinc-300")}>
                            {row.effect_cd === "glitch"
                              ? <span className={cn("inline-block", cls)} data-text="미리보기">미리보기</span>
                              : cls
                                ? <span className={cn("inline-block", cls)}>미리보기</span>
                                : "미리보기"
                            }
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={String(row.rarity_level)}
                            onValueChange={(v) => void updateLevel(row.effect_cd, Number(v))}
                            disabled={saving === row.effect_cd}
                          >
                            <SelectTrigger className={cn("h-7 rounded-lg text-[11px]", LEVEL_COLOR[row.rarity_level])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEVEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className={cn("text-[11px]", LEVEL_COLOR[Number(opt.value)])}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button
                            onClick={() => void toggleUseYn(row.effect_cd, row.use_yn)}
                            disabled={toggling === row.effect_cd}
                            className={cn(
                              "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                              row.use_yn
                                ? "bg-success/10 text-success hover:bg-success/20"
                                : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                            )}
                          >
                            {toggling === row.effect_cd ? "..." : row.use_yn ? "사용" : "잠금"}
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </CardItem>
            </div>
          )}

          {/* 프레임 */}
          {(typeFilter === "all" || typeFilter === "frame") && frameRows.length > 0 && (
            <div className="flex flex-col gap-2">
              {typeFilter === "all" && (
                <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">카드 프레임 — {frameRows.length}종</p>
              )}
              <CardItem className="p-0">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="bg-muted/40">
                    <tr className="border-b">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">이펙트</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">코드</th>
                      <th className="w-48 px-3 py-1.5 text-center font-medium text-muted-foreground">미리보기</th>
                      <th className="w-28 px-3 py-1.5 text-center font-medium text-muted-foreground">등급</th>
                      <th className="w-16 px-3 py-1.5 text-center font-medium text-muted-foreground">사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frameRows.map((row) => {
                      const cls = FRAME_CSS[row.effect_cd] ?? "";
                      return (
                      <tr key={row.effect_cd} className={cn("border-b last:border-0 hover:bg-muted/20", !row.use_yn && "opacity-40")}>
                        <td className="px-3 py-1.5 font-medium text-foreground">{row.effect_nm}</td>
                        <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{row.effect_cd}</td>
                        <td className="px-3 py-2">
                          <div className={cn("flex items-center justify-center rounded-xl bg-card px-3 py-1.5 text-[11px] text-foreground", cls || "border border-border")}>
                            프레임 미리보기
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={String(row.rarity_level)}
                            onValueChange={(v) => void updateLevel(row.effect_cd, Number(v))}
                            disabled={saving === row.effect_cd}
                          >
                            <SelectTrigger className={cn("h-7 rounded-lg text-[11px]", LEVEL_COLOR[row.rarity_level])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEVEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className={cn("text-[11px]", LEVEL_COLOR[Number(opt.value)])}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button
                            onClick={() => void toggleUseYn(row.effect_cd, row.use_yn)}
                            disabled={toggling === row.effect_cd}
                            className={cn(
                              "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                              row.use_yn
                                ? "bg-success/10 text-success hover:bg-success/20"
                                : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                            )}
                          >
                            {toggling === row.effect_cd ? "..." : row.use_yn ? "사용" : "잠금"}
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </CardItem>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
