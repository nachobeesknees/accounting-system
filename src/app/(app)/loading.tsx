import {
  SkeletonPageHeader,
  SkeletonTableCard,
  SkeletonTile,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 px-6 my-3.5">
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 px-6 mb-3.5">
        <SkeletonTableCard title="Accounts Receivable aging" cols={2} rows={4} />
        <SkeletonTableCard title="Accounts Payable aging" cols={2} rows={4} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 px-6 mb-3.5">
        <SkeletonTableCard title="Recent journal entries" cols={4} rows={6} />
        <SkeletonTableCard title="Upcoming bills due" cols={4} rows={5} />
      </div>
    </>
  );
}
