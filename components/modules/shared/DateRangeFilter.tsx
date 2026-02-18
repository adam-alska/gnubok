'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DateRangeFilterProps {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}

export function DateRangeFilter({ from, to, onFromChange, onToChange }: DateRangeFilterProps) {
  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Från</Label>
        <Input
          type="date"
          value={from}
          onChange={e => onFromChange(e.target.value)}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Till</Label>
        <Input
          type="date"
          value={to}
          onChange={e => onToChange(e.target.value)}
          className="h-9 w-40"
        />
      </div>
    </div>
  )
}
