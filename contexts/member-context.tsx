"use client";

import { createContext, useContext } from "react";
import type { Member } from "@/lib/get-member";

type MemberContextValue = {
  member: Member | null;
};

const MemberContext = createContext<MemberContextValue>({ member: null });

export function MemberProvider({
  member,
  children,
}: {
  member: Member | null;
  children: React.ReactNode;
}) {
  return (
    <MemberContext.Provider value={{ member }}>
      {children}
    </MemberContext.Provider>
  );
}

export function useMember() {
  return useContext(MemberContext);
}
