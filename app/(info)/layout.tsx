import { BackHeader } from "@/components/back-header";

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <BackHeader />
      <main>{children}</main>
    </div>
  );
}
