import { SkeletonPageHeader, SkeletonTableCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="px-6 py-3.5">
        <SkeletonTableCard title="Journal entries" cols={6} rows={12} />
      </div>
    </>
  );
}
