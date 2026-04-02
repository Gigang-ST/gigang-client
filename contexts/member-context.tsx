"use client";

import { createContext, useContext } from "react";
import type { Member } from "@/lib/get-member";

type MemberContextValue = {
  userId: string | null;
  member: Member | null;
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
  member: Member | null;
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
