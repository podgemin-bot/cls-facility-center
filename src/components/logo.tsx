import Link from "next/link"
import { Building2 } from "lucide-react"

export const Logo = () => (
  <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
    <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Building2 className="size-5" />
    </span>
    <span className="flex flex-col leading-tight">
      <span className="text-base font-bold tracking-tight">CLS Facility Center</span>
      <span className="text-[11px] text-muted-foreground">ศูนย์เคเบิลใต้น้ำ ปากบารา · สงขลา</span>
    </span>
  </Link>
)
