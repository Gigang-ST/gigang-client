"use client";

import { useEffect, useState } from "react";

import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Station = { name: string; lines: string[] };

type StationComboboxProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
};

/**
 * 수도권 지하철역 검색 콤보박스.
 * 팝오버가 열릴 때 역 데이터(lib/data/subway-stations.json)를 dynamic import 한다 — 초기 번들 제외.
 */
export function StationCombobox({
  value,
  onChange,
  placeholder = "가까운 역 검색 (선택)",
}: StationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<Station[] | null>(null);
  const [query, setQuery] = useState("");
  // stations가 null이면 아직 로드 전(또는 로딩 중) — 별도 loading state 없이 파생한다.
  const loading = open && stations === null;

  useEffect(() => {
    if (!open || stations) return;
    let cancelled = false;
    import("@/lib/data/subway-stations.json")
      .then((mod) => {
        if (!cancelled) setStations(mod.default as Station[]);
      })
      .catch(() => {
        if (!cancelled) setStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stations]);

  const selectedStation = stations?.find((s) => s.name === value) ?? null;
  const filteredStations = query
    ? (stations ?? []).filter((s) => s.name.includes(query))
    : (stations ?? []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-12 w-full justify-between rounded-xl border-[1.5px] px-3 text-[15px] font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value
              ? selectedStation
                ? `${selectedStation.name} (${selectedStation.lines.join("·")})`
                : value
              : placeholder}
          </span>
          <span className="flex items-center gap-1">
            {value ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onChange(null);
                  }
                }}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary"
                aria-label="선택 해제"
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="역 이름 검색" onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : (
              <>
                <CommandEmpty>검색 결과가 없어요.</CommandEmpty>
                <CommandGroup>
                  {filteredStations.slice(0, 50).map((station) => (
                    <CommandItem
                      key={station.name}
                      value={station.name}
                      onSelect={() => {
                        onChange(station.name === value ? null : station.name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          value === station.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {station.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({station.lines.join("·")})
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
