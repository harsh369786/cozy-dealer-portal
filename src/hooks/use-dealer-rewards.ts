import { useCallback } from "react";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  fetchDealerRewardsSummary,
  type DealerRewardsSummary,
} from "@/lib/dealer-rewards-summary";

export function useDealerRewards() {
  const query = useAsyncData(() => fetchDealerRewardsSummary(), []);

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
