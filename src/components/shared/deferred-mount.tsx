import type { ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";
import { PageSkeleton } from "@/components/shared/states";

export function DeferredMount({
  children,
  fallback = <PageSkeleton rows={3} />,
  rootMargin = "160px",
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
}) {
  const { ref, visible } = useInView(rootMargin);

  return <div ref={ref}>{visible ? children : fallback}</div>;
}
