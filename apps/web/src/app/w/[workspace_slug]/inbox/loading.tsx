import { SNSkeleton } from '@sineva/ui';
import { InboxListSkeleton } from '@/client/components/inbox/inbox_list';

// The list pane's shape while the first page loads: title, tabs, five rows.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex min-h-0 flex-1">
      <div className="flex w-full flex-col gap-3 pt-4 lg:w-[380px] lg:border-e lg:border-border xl:w-[420px]">
        <div className="space-y-3 px-4">
          <SNSkeleton variant="text" className="h-6 w-24" />
          <SNSkeleton variant="text" className="h-10 w-full" />
          <SNSkeleton variant="rect" className="h-11 w-full rounded-sm" />
        </div>
        <InboxListSkeleton />
      </div>
    </div>
  );
}
