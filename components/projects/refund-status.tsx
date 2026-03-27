export async function RefundStatus({
  participationId,
  projectId,
}: {
  participationId: string;
  projectId: string;
}) {
  return <div data-participation={participationId} data-project={projectId} />;
}
