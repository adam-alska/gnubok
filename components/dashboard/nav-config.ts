import {
  LayoutDashboard,
  Receipt,
  Users,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Settings,
  Calculator,
  Upload,
  Calendar,
  Camera,
  HelpCircle,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import type { EntityType } from '@/types'

export interface NavItemDef {
  href: string
  label: string
  icon: LucideIcon
  group: string
  modes?: EntityType[]
}

export const navItems: NavItemDef[] = [
  { href: '/', label: 'Översikt', icon: LayoutDashboard, group: 'main' },
  { href: '/calendar', label: 'Kalender', icon: Calendar, group: 'main' },
  { href: '/invoices', label: 'Fakturor', icon: Receipt, group: 'finans' },
  { href: '/customers', label: 'Kunder', icon: Users, group: 'finans' },
  { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight, group: 'finans' },
  { href: '/receipts', label: 'Kvitton', icon: Camera, group: 'finans' },
  { href: '/deductions', label: 'Avdrag', icon: Calculator, group: 'finans' },
  { href: '/bookkeeping', label: 'Bokföring', icon: BookOpen, group: 'finans' },
  { href: '/modules', label: 'Företagsmoduler', icon: Building2, group: 'moduler' },
  { href: '/import', label: 'Importera', icon: Upload, group: 'övrigt' },
  { href: '/reports', label: 'Rapporter', icon: BarChart3, group: 'övrigt' },
  { href: '/help', label: 'Hjälp', icon: HelpCircle, group: 'övrigt' },
  { href: '/settings', label: 'Inställningar', icon: Settings, group: 'övrigt' },
]

export const groupLabels: Record<string, string> = {
  main: 'Huvudmeny',
  finans: 'Finans',
  moduler: 'Företagsmoduler',
  övrigt: 'Övrigt',
}
