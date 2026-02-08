import { LoadingState } from "@/components/ui/loading-state";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState
        variant="blueprint"
        message="Loading your renovations..."
      />
    </div>
  );
}
