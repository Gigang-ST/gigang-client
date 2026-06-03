import { Suspense } from "react";
import { MemberProviderServer } from "@/components/member-provider-server";

export default function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <MemberProviderServer>
        <div className="min-h-svh bg-background">
          <main>{children}</main>
        </div>
      </MemberProviderServer>
    </Suspense>
  );
}
