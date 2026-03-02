import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type HeroTypographyProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "span" | "h1" | "p"
}

export function HeroTypography({
  as: Comp = "span",
  className,
  ...props
}: HeroTypographyProps) {
  return <Comp className={cn(className)} {...props} />
}
