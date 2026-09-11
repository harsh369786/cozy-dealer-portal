import { useCallback } from "react";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  fetchDealerRewardsSummary,
  type DealerRewardsSummary,
} from "@/lib/dealer-rewards-summary";

/**
 * @param opts.light  When true (default), fetches the reward catalog WITHOUT inline image data —
 *   enough to compute the balance/next-reward progress bar without pulling a large payload. The full
 *   rewards page (which renders reward images) passes `{ light: false }`.
 */
export function useDealerRewards(opts?: { light?: boolean }) {
  const light = opts?.light ?? true;
  const query = useAsyncData(() => fetchDealerRewardsSummary({ light }), [light]);

  const refresh = useCallback(() => {
    query.retry();
  }, [query]);

  return {
    summary: query.data,
    loading: query.loading,
    error: query.error,
    refresh,
  };
}

export type { DealerRewardsSummary };
