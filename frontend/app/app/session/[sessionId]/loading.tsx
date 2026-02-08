import { LoadingState } from "@/components/ui/loading-state";

export default function SessionLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingState
        variant="building"
        message="Setting up your session..."
      />
    </div>
  );
}
