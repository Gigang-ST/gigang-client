export async function MyActivityList({ participationId }: { participationId: string }) {
  return <div data-participation={participationId} />;
}
