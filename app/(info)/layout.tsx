import { BackHeader } from "@/components/back-header";

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-white">
      <BackHeader />
      <main>{children}</main>
    </div>
  );
}
