'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AbsenceRecord, Employee } from '@/types/payroll'
import { ABSENCE_TYPE_LABELS, SWEDISH_MONTHS } from '@/types/payroll'

const absenceColors: Record<string, string> = {
  sick_leave: 'bg-red-100 text-red-800 border-red-200',
  parental_leave: 'bg-purple-100 text-purple-800 border-purple-200',
  vacation: 'bg-blue-100 text-blue-800 border-blue-200',
  child_care: 'bg-orange-100 text-orange-800 border-orange-200',
  unpaid_leave: 'bg-gray-100 text-gray-800 border-gray-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
}

interface AbsenceCalendarProps {
  employeeId?: string
  onAddAbsence?: () => void
}

export function AbsenceCalendar({ employeeId, onAddAbsence }: AbsenceCalendarProps) {
  const [absences, setAbsences] = useState<(AbsenceRecord & { employee?: Employee })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchAbsences()
  }, [currentMonth, currentYear, employeeId])

  async function fetchAbsences() {
    setIsLoading(true)
    const month = currentMonth + 1

    let url = `/api/absence?year=${currentYear}&month=${month}`
    if (employeeId) {
      url += `&employee_id=${employeeId}`
    }

    const res = await fetch(url)
    const json = await res.json()

    if (res.ok) {
      setAbsences(json.data || [])
    } else {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta frånvaro',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  function previousMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(prev => prev - 1)
    } else {
      setCurrentMonth(prev => prev - 1)
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(prev => prev + 1)
    } else {
      setCurrentMonth(prev => prev + 1)
    }
  }

  // Generate calendar days
  const firstDay = new Date(currentYear, currentMonth, 1)
  const lastDay = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = (firstDay.getDay() + 6) % 7 // Monday = 0

  function getAbsencesForDay(day: number): typeof absences {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return absences.filter(a => {
      return a.start_date <= dateStr && a.end_date >= dateStr
    })
  }

  const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Frånvarokalender</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={previousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {SWEDISH_MONTHS[currentMonth + 1]} {currentYear}
            </span>
            <Button size="sm" variant="ghost" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {onAddAbsence && (
              <Button size="sm" onClick={onAddAbsence}>
                <Plus className="h-4 w-4 mr-1" />
                Registrera
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            Laddar...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}

              {/* Empty cells before first day */}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-12" />
              ))}

              {/* Calendar days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayAbsences = getAbsencesForDay(day)
                const isWeekend = ((startDayOfWeek + i) % 7) >= 5
                const isToday = day === new Date().getDate() &&
                  currentMonth === new Date().getMonth() &&
                  currentYear === new Date().getFullYear()

                return (
                  <div
                    key={day}
                    className={`h-12 border rounded-md p-1 text-xs relative ${
                      isWeekend ? 'bg-muted/30' : ''
                    } ${isToday ? 'ring-2 ring-primary' : ''}`}
                  >
                    <span className={`${isToday ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                      {day}
                    </span>
                    {dayAbsences.length > 0 && (
                      <div className="absolute bottom-0.5 left-0.5 right-0.5 flex gap-0.5">
                        {dayAbsences.slice(0, 2).map((absence, idx) => (
                          <div
                            key={idx}
                            className={`h-1.5 flex-1 rounded-full ${
                              absenceColors[absence.absence_type]?.split(' ')[0] || 'bg-gray-200'
                            }`}
                            title={`${absence.employee?.first_name || ''} - ${ABSENCE_TYPE_LABELS[absence.absence_type]}`}
                          />
                        ))}
                        {dayAbsences.length > 2 && (
                          <span className="text-[8px] text-muted-foreground">+{dayAbsences.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Absence list for the month */}
            {absences.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <p className="text-sm font-medium text-muted-foreground">Frånvaro denna månad</p>
                {absences.map(absence => (
                  <div key={absence.id} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${absenceColors[absence.absence_type] || ''}`}
                      >
                        {ABSENCE_TYPE_LABELS[absence.absence_type]}
                      </Badge>
                      <span>
                        {absence.employee?.first_name} {absence.employee?.last_name}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {absence.start_date} - {absence.end_date} ({absence.days_count} dagar)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
