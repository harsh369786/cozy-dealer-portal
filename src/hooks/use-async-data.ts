import { useCallback, useEffect, useRef, useState } from "react";
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
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;
  // M-2: remember the deps from the previous run so we can tell a genuine query-parameter change
  // (must clear stale data immediately) apart from a retry (same params — keep showing old data).
  const prevDepsRef = useRef<unknown[] | null>(null);
  const formatApiError = useFormatApiError();

  const retry = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    // M-2: when the query parameters (deps) change, the currently displayed data belongs to the OLD
    // parameters and is now misleading (e.g. an "All time" filter still showing the previous month's
    // rows). Clear it up front so the UI shows a loading state instead of stale rows. A retry (deps
    // unchanged) keeps the existing data visible while re-fetching, as before.
    const prev = prevDepsRef.current;
    const depsChanged =
      prev === null || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]));
    prevDepsRef.current = deps;

    if (depsChanged && dataRef.current != null) {
      setData(null);
      dataRef.current = null;
    }

    const hasData = dataRef.current != null;
    if (!hasData) setLoading(true);
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
