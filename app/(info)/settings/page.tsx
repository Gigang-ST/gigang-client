import { hasUnreadBoardPosts } from "@/lib/queries/board";
import { getCurrentMember } from "@/lib/queries/member";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { SettingsClient } from "@/components/settings/settings-client";

/**
 * 회비 미납 dot을 켜는 최소 미납액(원).
 *
 * `bal_amt < 0`(1원이라도 모자라면)으로 잡으면 **끝수 미납까지 점이 켜진다** — 실제로
 * 미납자 122명 중 24명이 1,000~3,000원대다(2026-07 prd 실측). 그 정도는 다음 회비에
 * 얹히면 정리되는 금액이라, 점을 띄워 봐야 "지울 수 없는 빨간 점"만 늘린다.
 * 잔액은 음수로 쌓이므로 비교는 `bal_amt <= -DUES_DOT_MIN_UNPAID`.
 */
const DUES_DOT_MIN_UNPAID = 4000;

export default async function SettingsPage() {
  const { member, supabase } = await getCurrentMember();
  const { teamId } = await getRequestTeamContext();
  const isAdmin = member?.admin ?? false;

  // 점은 두 종류가 있고 **바깥(햄버거)까지 올라가는지가 갈린다**(§HeaderActions):
  //
  // - 공지·업데이트 안읽음 → 여기 각 줄 + 햄버거까지. 눌러서 읽으면 지워지므로
  //   "빨간 점 = 볼 게 있다"는 약속을 지킨다.
  // - 회비 미납 → **이 화면 안의 "회비 내역" 줄에만.** 미납은 봐도 안 지워진다(돈을 내고
  //   운영진이 반영해야 꺼진다). 이걸 햄버거까지 올리면 미납자는 몇 주씩 점을 이고 다니게 되고,
  //   점이 "원래 켜져 있는 것"으로 읽혀 정작 공지 안읽음을 못 가린다. 안쪽에 두면 회비 내역을
  //   보러 들어온 사람에게만 보이므로 그 부작용이 없다.
  //
  // 잔액은 **스냅샷을 읽기만 한다**(회비 계산 로직은 손대지 않음).
  const [boardUnread, balSnapRes] = await Promise.all([
    hasUnreadBoardPosts(member?.id, teamId),
    member
      ? supabase
          .from("fee_mem_bal_snap")
          .select("bal_amt")
          .eq("team_id", teamId)
          .eq("mem_id", member.id)
          .eq("vers", 0)
          .eq("del_yn", false)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // 조회가 실패하면 점을 끈 채로 둔다 — 점 하나 때문에 설정 화면 전체를 못 열게 만들 수는
  // 없다. 다만 **조용히 넘기지는 않는다**: 잔액을 못 읽은 것과 미납이 없는 것은 전혀 다른
  // 상태라, 로그가 없으면 "왜 미납자에게 점이 안 떴는지"를 나중에 추적할 방법이 없다.
  if (balSnapRes.error) {
    console.error("[settings] 회비 잔액 조회 실패", balSnapRes.error.message);
  }

  return (
    <SettingsClient
      isAdmin={isAdmin}
      boardUnread={boardUnread}
      duesUnpaid={(balSnapRes.data?.bal_amt ?? 0) <= -DUES_DOT_MIN_UNPAID}
    />
  );
}
