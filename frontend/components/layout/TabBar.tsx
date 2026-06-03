"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/forge", label: "Architecture Forge" },
  { href: "/evaluation", label: "Evaluation Deck" },
]

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="h-[40px] flex items-end px-4 bg-[#0a0a0a] border-b border-[#404040] shrink-0 z-10 gap-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 h-[36px] flex items-center text-sm font-medium rounded-t transition-colors",
              active
                ? "bg-[#171717] text-[#fafafa] border border-b-0 border-[#404040]"
                : "text-[#a3a3a3] hover:text-[#fafafa] hover:bg-[#171717]/50"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
