import { useCallback, useEffect, useState } from "react";
import { useFormatApiError } from "@/lib/api-errors";

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const formatApiError = useFormatApiError();

  const retry = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    // When the query parameters (deps) change we KEEP the previously-loaded data on screen while the
    // new data is fetched, rather than clearing it to null. Clearing caused pages whose first-load
    // guard is `if (loading && !data) return <Skeleton/>` to unmount their whole subtree (including
    // search inputs) on every filtered refetch — which stole input focus and looked like a page
    // reload while typing. Keeping the prior data means the page stays mounted and results update in
    // place; `loading` still flips true so a page can show an inline/subtle refetch indicator.
    //
    // (Previously — "M-2" — data was nulled on dep change to avoid briefly showing stale rows. The
    // focus-loss regression outweighs that: a short overlap of old rows during a refetch is far less
    // disruptive than losing the search field mid-type. `loading` still communicates the refetch.)

    // Always mark loading for the in-flight request; crucially we do NOT clear data, so any page
    // guarding on `loading && !data` keeps its content mounted during a filtered refetch.
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(formatApiError(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, formatApiError, ...deps]);

  return { data, loading, error, retry };
}
