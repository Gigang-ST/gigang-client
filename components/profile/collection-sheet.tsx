"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { setPrimaryTitle, setSelectedEffect } from "@/app/actions/profile/update-collection";
import { Check, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  타입                                                                */
/* ------------------------------------------------------------------ */

type OwnedTitle = {
  mem_ttl_id: string;
  ttl_id: string;
  is_prmy_yn: boolean;
};

type AllTitle = {
  ttl_id: string;
  ttl_nm: string;
  ttl_desc: string | null;
  rarity_level: number;
  is_event_yn: boolean;
  ttl_ctgr_cd: string;
};

type EffectRow = {
  effect_cd: string;
  effect_nm: string;
  effect_type: "badge" | "frame";
  rarity_level: number;
};

type Tab = "title" | "badge" | "frame";

/* ------------------------------------------------------------------ */
/*  배지 CSS 매핑                                                       */
/* ------------------------------------------------------------------ */

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

// 이펙트별 테두리+텍스트 색상
const BADGE_BORDER: Record<string, string> = {
  none: "border-zinc-700 text-zinc-300",
  dim: "border-zinc-600", breathe: "border-zinc-500",
  "italic-drift": "border-zinc-600", "dot-blink": "border-zinc-600",
  "glow-soft": "border-zinc-500", "soft-shine": "border-slate-400/60",
  silver: "border-slate-400/60", "underline-fade": "border-sky-400/40",
  flare: "border-sky-400/50", bronze: "border-amber-700/60",
  neon: "border-sky-400/60 text-sky-400", emerald: "border-emerald-500/50",
  sapphire: "border-blue-500/50", gold: "border-amber-400/50",
  ice: "border-cyan-400/50", pearl: "border-slate-300/60",
  titanium: "border-slate-500/50", hologram: "border-violet-400/50",
  "aurora-text": "border-emerald-400/50", "pulse-color": "border-violet-400/50",
  "void-text": "border-indigo-500/50", ruby: "border-rose-500/50",
  amethyst: "border-purple-500/50", fire: "border-orange-500/60",
  rainbow: "border-pink-400/50", plasma: "border-fuchsia-500/50",
  lava: "border-red-600/60", crimson: "border-red-500/60",
  matrix: "border-green-500/50 text-green-400",
  glitch: "border-slate-500 text-slate-200",
  chromatic: "border-slate-500", wave: "border-sky-400/50",
  zoom: "border-fuchsia-400/50", bounce: "border-orange-400/50 text-orange-400",
  shake: "border-red-400/50 text-red-400", flip: "border-violet-400/50",
  typewriter: "border-green-400/50 text-green-400",
  "bounce-rainbow": "border-pink-400/50", "bounce-ice": "border-cyan-400/50",
  "shake-fire": "border-orange-500/60", "wave-hologram": "border-violet-400/50",
  "flip-gold": "border-amber-400/50", obsidian: "border-indigo-500/50",
  "shake-lava": "border-red-600/60", "zoom-plasma": "border-fuchsia-500/60",
  "zoom-rainbow": "border-pink-400/60", "wave-fire": "border-orange-500/60",
  spark: "border-violet-400/50 text-violet-300",
};

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

/* ------------------------------------------------------------------ */
/*  BadgePreview                                                        */
/* ------------------------------------------------------------------ */

function BadgePreview({ effectCd, name }: { effectCd: string; name: string }) {
  const cls = BADGE_CSS[effectCd] ?? "";
  const border = BADGE_BORDER[effectCd] ?? "border-zinc-700 text-zinc-300";
  return (
    <span className={cn("inline-flex items-center rounded-full border bg-zinc-900 px-2 py-0.5 text-[11px] font-medium", border)}>
      {effectCd === "glitch"
        ? <span className={cn("inline-block", cls)} data-text={name}>{name}</span>
        : cls ? <span className={cn("inline-block", cls)}>{name}</span>
        : name
      }
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  CollectionSheet                                                     */
/* ------------------------------------------------------------------ */

export function CollectionSheet({
  open,
  onClose,
  teamMemId,
  teamId,
  currentPrimaryTtlId,
  currentBadgeEffect,
  currentFrameCd,
  maxRarityLevel,
  memberName,
}: {
  open: boolean;
  onClose: () => void;
  teamMemId: string;
  teamId: string;
  currentPrimaryTtlId: string | null;
  currentBadgeEffect: string | null;
  currentFrameCd: string | null;
  maxRarityLevel: number;
  memberName: string;
}) {
  const [tab, setTab] = useState<Tab>("title");
  const [ownedTitleIds, setOwnedTitleIds] = useState<Set<string>>(new Set());
  const [allTitles, setAllTitles] = useState<AllTitle[]>([]);
  const [allEffects, setAllEffects] = useState<EffectRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedTtlId, setSelectedTtlId] = useState<string | null>(currentPrimaryTtlId);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(currentBadgeEffect);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(currentFrameCd);

  const [isPending, startTransition] = useTransition();

  // 선택된 칭호 정보
  const selectedTitle = allTitles.find((t) => t.ttl_id === selectedTtlId);
  const previewName = selectedTitle?.ttl_nm ?? "GIGANG";

  // 데이터 로드
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      // 전체 칭호 목록
      supabase
        .from("ttl_mst")
        .select("ttl_id, ttl_nm, ttl_desc, rarity_level, is_event_yn, ttl_ctgr_cd")
        .eq("team_id", teamId)
        .eq("vers", 0)
        .eq("del_yn", false)
        .eq("use_yn", true)
        .order("sort_ord"),
      // 내가 보유한 칭호 id 목록
      supabase
        .from("mem_ttl_rel")
        .select("ttl_id")
        .eq("team_mem_id", teamMemId)
        .eq("vers", 0)
        .eq("del_yn", false),
      // 이펙트 목록
      supabase
        .from("effect_mst")
        .select("effect_cd, effect_nm, effect_type, rarity_level")
        .eq("use_yn", true)
        .order("rarity_level").order("sort_ord"),
    ]).then(([titlesRes, ownedRes, effectsRes]) => {
      setAllTitles((titlesRes.data ?? []) as AllTitle[]);
      setOwnedTitleIds(new Set((ownedRes.data ?? []).map((r) => r.ttl_id)));
      setAllEffects((effectsRes.data ?? []) as EffectRow[]);
      setLoading(false);
    });
  }, [open, teamMemId, teamId]);

  // 칭호 분리
  const regularTitles = allTitles.filter((t) => !t.is_event_yn);
  const eventTitles = allTitles.filter((t) => t.is_event_yn);

  // 해금된 이펙트
  const unlockedBadges = allEffects.filter((e) => e.effect_type === "badge" && e.rarity_level <= maxRarityLevel);
  const unlockedFrames = allEffects.filter((e) => e.effect_type === "frame" && e.rarity_level <= maxRarityLevel);
  const lockedBadges = allEffects.filter((e) => e.effect_type === "badge" && e.rarity_level > maxRarityLevel);
  const lockedFrames = allEffects.filter((e) => e.effect_type === "frame" && e.rarity_level > maxRarityLevel);

  const handleSave = () => {
    startTransition(async () => {
      if (selectedTtlId !== currentPrimaryTtlId) {
        await setPrimaryTitle(selectedTtlId);
      }
      if (selectedBadge !== currentBadgeEffect || selectedFrame !== currentFrameCd) {
        await setSelectedEffect(selectedBadge, selectedFrame);
      }
      onClose();
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 flex h-[55dvh] flex-col rounded-t-2xl bg-background">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-base font-bold text-foreground">내 컬렉션</h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* 탭 + 저장 */}
        <div className="flex items-center border-b border-border px-6">
          <div className="flex flex-1">
            {([
              { key: "title", label: "칭호" },
              { key: "badge", label: "이펙트" },
              { key: "frame", label: "프레임" },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "mr-4 pb-3 text-sm font-medium transition-colors",
                  tab === key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="mb-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "저장"}
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : (
            <>
              {/* ── 칭호 탭 ── */}
              {tab === "title" && (
                <div className="flex flex-col gap-5">
                  {/* 일반 칭호 */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">일반</span>
                      <span className="text-[11px] text-muted-foreground">
                        {regularTitles.filter((t) => ownedTitleIds.has(t.ttl_id)).length} / {regularTitles.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {regularTitles.map((t) => {
                        const owned = ownedTitleIds.has(t.ttl_id);
                        const isSelected = selectedTtlId === t.ttl_id;
                        return (
                          <button
                            key={t.ttl_id}
                            onClick={() => owned && setSelectedTtlId(isSelected ? null : t.ttl_id)}
                            disabled={!owned}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                              owned && isSelected && "border-primary bg-primary/10 text-primary",
                              owned && !isSelected && "border-border bg-secondary text-foreground",
                              !owned && "border-border bg-muted text-muted-foreground opacity-40 cursor-default",
                            )}
                          >
                            {owned ? t.ttl_nm : "???"}
                            {isSelected && <Check className="size-3" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Event 칭호 — 보유한 것만 표시 (가리지 않음) */}
                  {eventTitles.filter((t) => ownedTitleIds.has(t.ttl_id)).length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">Event</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {eventTitles
                          .filter((t) => ownedTitleIds.has(t.ttl_id))
                          .map((t) => {
                            const isSelected = selectedTtlId === t.ttl_id;
                            return (
                              <button
                                key={t.ttl_id}
                                onClick={() => setSelectedTtlId(isSelected ? null : t.ttl_id)}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                  isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-foreground",
                                )}
                              >
                                {t.ttl_nm}
                                {isSelected && <Check className="size-3" />}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* 선택된 칭호 설명 */}
                  {selectedTitle && (
                    <div className="rounded-xl border border-border bg-muted/50 px-4 py-3">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">획득 방법</p>
                      <p className="text-xs text-foreground leading-relaxed">
                        {selectedTitle.ttl_desc ?? "획득 방법 정보가 없습니다."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── 이펙트 탭 ── */}
              {tab === "badge" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                      해금 ({unlockedBadges.length}종)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {unlockedBadges.map((e) => {
                        const isSelected = selectedBadge === e.effect_cd;
                        return (
                          <button
                            key={e.effect_cd}
                            onClick={() => setSelectedBadge(isSelected ? null : e.effect_cd)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border transition-all",
                              isSelected ? "border-primary bg-primary/10 pr-1.5" : "border-transparent"
                            )}
                          >
                            <BadgePreview effectCd={e.effect_cd} name={previewName} />
                            {isSelected && <Check className="size-3 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {lockedBadges.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                        잠김 ({lockedBadges.length}종)
                      </span>
                      <div className="flex flex-wrap gap-2 opacity-30">
                        {lockedBadges.map((e) => (
                          <span key={e.effect_cd} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                            🔒 {e.effect_nm}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 프레임 탭 ── */}
              {tab === "frame" && (
                <div className="flex flex-col gap-5">
                  {/* 미리보기 카드 */}
                  <div className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-card p-4 transition-all",
                    selectedFrame ? (FRAME_CSS[selectedFrame] ?? "border-border") : "border-border"
                  )}>
                    <div className="size-10 shrink-0 rounded-full bg-secondary" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{memberName}</span>
                        {selectedTitle && (
                          <BadgePreview effectCd={selectedBadge ?? "none"} name={selectedTitle.ttl_nm} />
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">미리보기</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                      해금 ({unlockedFrames.length}종)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {unlockedFrames.map((e) => {
                        const isSelected = selectedFrame === e.effect_cd;
                        const frameCls = FRAME_CSS[e.effect_cd] ?? "";
                        return (
                          <button
                            key={e.effect_cd}
                            onClick={() => setSelectedFrame(isSelected ? null : e.effect_cd)}
                            className={cn(
                              "relative flex h-16 items-center justify-center rounded-2xl border bg-card transition-all",
                              frameCls || "border-border",
                              isSelected && "ring-2 ring-primary ring-offset-1"
                            )}
                          >
                            {isSelected && (
                              <span className="flex size-5 items-center justify-center rounded-full bg-primary">
                                <Check className="size-3 text-primary-foreground" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {lockedFrames.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">
                        잠김 ({lockedFrames.length}종)
                      </span>
                      <div className="grid grid-cols-2 gap-2 opacity-30">
                        {lockedFrames.map((e) => {
                          const frameCls = FRAME_CSS[e.effect_cd] ?? "";
                          return (
                            <div key={e.effect_cd} className={cn("flex h-16 items-center justify-center rounded-2xl border bg-card", frameCls || "border-border")}>
                              <span className="text-base">🔒</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
