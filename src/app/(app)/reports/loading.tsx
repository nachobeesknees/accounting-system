import { SkeletonPageHeader, SkeletonTableCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        <SkeletonTableCard title="Trial balance" cols={4} rows={10} />
        <SkeletonTableCard title="Income statement" cols={3} rows={8} />
        <SkeletonTableCard title="Balance sheet" cols={3} rows={10} />
      </div>
    </>
  );
}
