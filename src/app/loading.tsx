import { SkeletonHeader, SkeletonTable } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <div className="px-6 py-3.5 pb-8">
        <Card title="Loading…">
          <SkeletonTable rows={6} cols={5} />
        </Card>
      </div>
    </>
  );
}
