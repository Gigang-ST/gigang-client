export async function MyStatus({ participationId }: { participationId: string }) {
  return <div data-participation={participationId} />;
}
