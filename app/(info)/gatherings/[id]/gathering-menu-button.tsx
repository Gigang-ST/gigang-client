"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { MoreHorizontal } from "lucide-react";

import { deleteGathering } from "@/app/actions/gathering/manage-gathering";

import { GatheringFormDialog } from "@/components/schedule/gathering-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  gthrId: string;
  isAuthor: boolean;
  isAdmin: boolean;
  gthrData: {
    gthr_nm: string;
    gthr_type_enm: string;
    sprt_cd?: string | null;
    stt_at: string;
    end_at: string | null;
    loc_txt: string | null;
    desc_txt: string | null;
    max_prt_cnt: number | null;
  };
};

export function GatheringMenuButton({ gthrId, isAuthor, isAdmin, gthrData }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteGathering(gthrId);
      router.replace("/");
    } catch (e) {
      console.error(e);
      setIsDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isAuthor && (
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              수정
            </DropdownMenuItem>
          )}
          {(isAuthor || isAdmin) && (
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              삭제
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 수정 다이얼로그 */}
      <GatheringFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialData={{ gthr_id: gthrId, ...gthrData }}
        onSuccess={() => router.refresh()}
      />

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>모임 삭제</DialogTitle>
            <DialogDescription>
              &apos;{gthrData.gthr_nm}&apos;을 삭제하시겠습니까? 참석자들에게 알림이 발송됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
