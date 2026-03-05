'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Flame, Receipt, CreditCard, Camera, ArrowRight } from 'lucide-react'
import type { ReceiptQueueSummary } from '@/types'

interface ReceiptDashboardProps {
  summary: ReceiptQueueSummary
  onScanReceipt: () => void
  onViewReceiptQueue: () => void
  onViewTransactionQueue: () => void
}

export default function ReceiptDashboard({
  summary,
  onScanReceipt,
  onViewReceiptQueue,
  onViewTransactionQueue,
}: ReceiptDashboardProps) {
  const hasWork =
    summary.unmatched_receipts_count > 0 ||
    summary.unmatched_transactions_count > 0 ||
    summary.pending_review_count > 0

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3">
        <Button
          variant="default"
          className="h-auto py-4 flex-col gap-2"
          onClick={onScanReceipt}
        >
          <Camera className="h-6 w-6" />
          <span>Skanna kvitto</span>
        </Button>
      </div>

      {/* Streak counter */}
      {summary.streak_count > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Flame className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.streak_count}</p>
                  <p className="text-sm text-muted-foreground">dagars streak!</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground max-w-24 text-right">
                Fortsätt bokföra varje dag
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Pending review */}
        {summary.pending_review_count > 0 && (
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={onViewReceiptQueue}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Att granska</p>
                    <p className="text-sm text-muted-foreground">
                      {summary.pending_review_count} kvitton
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">{summary.pending_review_count}</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unmatched receipts */}
        {summary.unmatched_receipts_count > 0 && (
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={onViewReceiptQueue}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Kvitton utan transaktion</p>
                    <p className="text-sm text-muted-foreground">
                      {summary.unmatched_receipts_count} st
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unmatched transactions */}
        {summary.unmatched_transactions_count > 0 && (
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={onViewTransactionQueue}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Transaktioner utan kvitto</p>
                    <p className="text-sm text-muted-foreground">
                      {summary.unmatched_transactions_count} st
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* All done state */}
      {!hasWork && (
        <Card className="bg-success/5 border-success/20">
          <CardContent className="pt-4 text-center py-8">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <svg
                className="h-8 w-8 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-lg">Allt är uppdaterat!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Inga kvitton eller transaktioner att granska
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
