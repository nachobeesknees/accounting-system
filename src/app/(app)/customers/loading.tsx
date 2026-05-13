import { SkeletonPageHeader, SkeletonTableCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="px-6 py-3.5">
        <SkeletonTableCard title="Clients" cols={6} rows={10} />
      </div>
    </>
  );
}
