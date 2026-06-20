export default function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <main>{children}</main>
    </div>
  );
}
