import { SNSkeleton } from './sn_skeleton';

export function SNSkeletonGallery() {
  return (
    <section aria-labelledby="gallery-sn-skeleton" className="max-w-md space-y-4">
      <h2 id="gallery-sn-skeleton" className="text-lg font-semibold text-text">
        SNSkeleton
      </h2>
      <div className="flex items-center gap-3">
        <SNSkeleton variant="circle" />
        <div className="flex-1 space-y-2">
          <SNSkeleton variant="text" />
          <SNSkeleton variant="text" className="w-2/3" />
        </div>
      </div>
      <SNSkeleton variant="rect" />
      <SNSkeleton variant="rect" className="h-24" />
    </section>
  );
}
