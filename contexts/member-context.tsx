"use client";

import { createContext, useContext } from "react";
import type { AppMemberProfile } from "@/lib/queries/app-member";

type MemberContextValue = {
  userId: string | null;
  member: AppMemberProfile | null;
};

const MemberContext = createContext<MemberContextValue>({
  userId: null,
  member: null,
});

export function MemberProvider({
  userId,
  member,
  children,
}: {
  userId: string | null;
  member: AppMemberProfile | null;
  children: React.ReactNode;
}) {
  return (
    <MemberContext.Provider value={{ userId, member }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  return useContext(MemberContext);
}
