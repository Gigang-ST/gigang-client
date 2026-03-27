export function JoinSection({
  project,
  participation,
}: {
  project: { id: string; name: string };
  participation: { deposit_confirmed: boolean } | null;
}) {
  return (
    <div>
      {participation ? "입금 확인 대기 중입니다." : "참여 신청 폼"}
    </div>
  );
}
