"use client";

import { createClient } from "@/lib/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type LogoutButtonProps = Omit<ButtonProps, "onClick"> & {
  label?: string;
};

export function LogoutButton({ label = "로그아웃", ...props }: LogoutButtonProps) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <Button onClick={logout} {...props}>
      {props.children ?? label}
    </Button>
  );
}
