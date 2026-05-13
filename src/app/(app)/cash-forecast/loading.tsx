import {
  SkeletonPageHeader,
  SkeletonTableCard,
  SkeletonTile,
} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 px-6 my-3.5">
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
      </div>
      <div className="px-6 pb-8">
        <SkeletonTableCard title="Projected cash flow" cols={5} rows={12} />
      </div>
    </>
  );
}
