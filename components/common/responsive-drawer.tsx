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
  const [matches, setMatches] = React.useState(false)
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
