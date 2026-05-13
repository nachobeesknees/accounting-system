import { SkeletonPageHeader, SkeletonTableCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        <SkeletonTableCard title="Per-entity rollup" cols={5} rows={8} />
        <SkeletonTableCard title="Consolidated totals" cols={3} rows={6} />
      </div>
    </>
  );
}
