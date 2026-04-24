import { Suspense } from "react";
import { BackHeader } from "@/components/back-header";
import { MemberProviderServer } from "@/components/member-provider-server";

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <MemberProviderServer>
        <div className="min-h-svh bg-background">
          <BackHeader />
          <main>{children}</main>
        </div>
      </MemberProviderServer>
    </Suspense>
  );
}
