'use client'

import type { EntityType } from '@/types'
import { useNavModules } from '@/hooks/useNavModules'
import DesktopNav from './DesktopNav'
import MobileNav from './MobileNav'

interface DashboardNavProps {
  companyName: string
  entityType: EntityType
}

export default function DashboardNav({ companyName, entityType }: DashboardNavProps) {
  const { sectorGroups } = useNavModules()

  return (
    <>
      <DesktopNav
        companyName={companyName}
        entityType={entityType}
        sectorGroups={sectorGroups}
      />
      <MobileNav
        companyName={companyName}
        entityType={entityType}
        sectorGroups={sectorGroups}
      />
    </>
  )
}
