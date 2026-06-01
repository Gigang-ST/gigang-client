"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { formatKSTDateTime } from "@/lib/dayjs";
import { createClient } from "@/lib/supabase/client";

import { revokeTitle } from "@/app/actions/admin/manage-title";

import { EmptyState } from "@/components/common/empty-state";
import { SectionLabel } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type HistoryRow = {
  mem_ttl_id: string;
  team_mem_id: string;
  grnt_at: string;
  grnt_by_mem_id: string | null;
  grnt_rsn_txt: string | null;
  team_mem_rel: {
    mem_mst: {
      mem_nm: string;
    };
  };
  ttl_mst: {
    ttl_nm: string;
  };
};

export function AdminTitleHistoryClient() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("mem_ttl_rel")
      .select(`
        mem_ttl_id,
        team_mem_id,
        grnt_at,
        grnt_by_mem_id,
        grnt_rsn_txt,
        team_mem_rel!inner(mem_mst!inner(mem_nm)),
        ttl_mst!inner(ttl_nm)
      `)
      .eq("vers", 0)
      .eq("del_yn", false)
      .order("grnt_at", { ascending: false })
      .limit(200);

    if (error) console.error("이력 조회 실패:", error);
    setRows((data ?? []) as unknown as HistoryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleRevoke = async (memTtlId: string) => {
    if (!confirm("이 멤버의 칭호를 회수하시겠습니까?")) return;
    setRevokingId(memTtlId);
    const result = await revokeTitle(memTtlId);
    if (!result.ok) {
      alert(result.message ?? "회수에 실패했습니다");
    } else {
      await loadHistory();
    }
    setRevokingId(null);
  };

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center gap-2">
        <SectionLabel>전체 칭호 획득 이력</SectionLabel>
        {!loading && (
          <span className="text-[11px] text-muted-foreground">
            {rows.length}건{rows.length >= 200 && " (최근 200건)"}
          </span>
        )}
      </div>

      {loading ? (
        <CardItem className="flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </CardItem>
      ) : rows.length === 0 ? (
        <EmptyState message="칭호 획득 이력이 없습니다." />
      ) : (
        <CardItem className="p-0">
          <div className="max-h-[calc(100dvh-200px)] overflow-y-auto overflow-x-auto">
            <table className="w-full border-collapse text-[11px] [font-variant-numeric:tabular-nums]">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">멤버명</th>
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">칭호명</th>
                  <th className="w-10 px-2 py-1.5 text-center font-medium text-muted-foreground">방식</th>
                  <th className="w-24 px-2 py-1.5 text-center font-medium text-muted-foreground">획득일시</th>
                  <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">사유</th>
                  <th className="w-10 px-2 py-1.5 text-center font-medium text-muted-foreground">회수</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.mem_ttl_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-2 py-1.5 text-center font-medium text-foreground">
                      <Link
                        href={`/admin/members?member=${row.team_mem_id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {row.team_mem_rel.mem_mst.mem_nm}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center font-medium text-foreground">
                      {row.ttl_mst.ttl_nm}
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      {row.grnt_by_mem_id === null ? "자동" : "수동"}
                    </td>
                    <td className="px-2 py-1.5 text-center text-muted-foreground">
                      {formatKSTDateTime(row.grnt_at).slice(0, 10)}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 text-center text-muted-foreground">
                      {row.grnt_rsn_txt ?? "-"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => void handleRevoke(row.mem_ttl_id)}
                        disabled={revokingId === row.mem_ttl_id}
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {revokingId === row.mem_ttl_id ? "..." : "회수"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardItem>
      )}
    </div>
  );
}
