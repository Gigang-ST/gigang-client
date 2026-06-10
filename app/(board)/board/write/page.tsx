import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { BackHeader } from "@/components/back-header";
import { PostForm } from "@/components/board/post-form";

export const metadata = { title: "게시글 작성" };

export default async function BoardWritePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { member } = await getCurrentMember();
  if (!member || !member.admin) redirect("/board");

  const { teamId } = await getRequestTeamContext();
  const { type } = await searchParams;
  const initialType = type === "update" ? "update" : "notice";

  return (
    <>
      <BackHeader title="게시글 작성" />
      <PostForm teamId={teamId} initialType={initialType} />
    </>
  );
}
