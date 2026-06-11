import { Skeleton, StatsSkeleton, ChartSkeleton } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'

// Route-transition skeleton for every dashboard page.
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <StatsSkeleton />
      <Card><ChartSkeleton height="h-80" /></Card>
    </div>
  )
}
