"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

function useMediaQuery(query: string) {
  // 첫 렌더부터 실제 값이어야 한다 — false로 시작해 이펙트에서 보정하면,
  // 데스크톱에서 다이얼로그가 open 상태로 마운트될 때 Drawer로 pushState된 뒤
  // Dialog로 교체(언마운트 back() + 재푸시)되며 useDialogHistoryBack의 히스토리
  // 스택이 어긋나 닫기 버튼이 사이트 밖(이전 사이트)으로 이탈한다.
  const [matches, setMatches] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  )
  React.useEffect(() => {
    const media = window.matchMedia(query)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(media.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [query])
  return matches
}

const ResponsiveDrawerContext = React.createContext<{ isDesktop: boolean }>({
  isDesktop: false,
})

interface ResponsiveDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function ResponsiveDrawer({ open, onOpenChange, children }: ResponsiveDrawerProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // 뒤로가기-닫기 히스토리 연동은 ui/dialog·ui/drawer Root 래퍼가 공통 처리한다.

  return (
    <ResponsiveDrawerContext.Provider value={{ isDesktop }}>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children}
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={onOpenChange}>
          {children}
        </Drawer>
      )}
    </ResponsiveDrawerContext.Provider>
  )
}

interface ResponsiveDrawerContentProps {
  children: React.ReactNode
  className?: string
  dialogClassName?: string
  drawerClassName?: string
}

function ResponsiveDrawerContent({
  children,
  className,
  dialogClassName,
  drawerClassName,
}: ResponsiveDrawerContentProps) {
  const { isDesktop } = React.useContext(ResponsiveDrawerContext)
  if (isDesktop) {
    return (
      <DialogContent className={cn(className, dialogClassName)}>
        {children}
      </DialogContent>
    )
  }
  return (
    <DrawerContent className={cn(className, drawerClassName)}>
      {children}
    </DrawerContent>
  )
}

function ResponsiveDrawerHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isDesktop } = React.useContext(ResponsiveDrawerContext)
  if (isDesktop) {
    return <DialogHeader className={className}>{children}</DialogHeader>
  }
  return <DrawerHeader className={className}>{children}</DrawerHeader>
}

function ResponsiveDrawerTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isDesktop } = React.useContext(ResponsiveDrawerContext)
  if (isDesktop) {
    return <DialogTitle className={className}>{children}</DialogTitle>
  }
  return <DrawerTitle className={className}>{children}</DrawerTitle>
}

function ResponsiveDrawerDescription({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isDesktop } = React.useContext(ResponsiveDrawerContext)
  if (isDesktop) {
    return <DialogDescription className={className}>{children}</DialogDescription>
  }
  return <DrawerDescription className={className}>{children}</DrawerDescription>
}

function ResponsiveDrawerClose({
  children,
  className,
  asChild,
}: {
  children: React.ReactNode
  className?: string
  asChild?: boolean
}) {
  const { isDesktop } = React.useContext(ResponsiveDrawerContext)
  if (isDesktop) {
    return (
      <DialogClose asChild={asChild} className={className}>
        {children}
      </DialogClose>
    )
  }
  return (
    <DrawerClose asChild={asChild} className={className}>
      {children}
    </DrawerClose>
  )
}

export {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
  ResponsiveDrawerDescription,
  ResponsiveDrawerClose,
}
