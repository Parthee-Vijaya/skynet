"use client";
import { useEffect, useRef, useState } from "react";

interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isStale: boolean;
  lastUpdated: number | undefined;
}

export function usePoll<T>(url: string, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | undefined>(undefined);
  const [isStale, setIsStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (cancelled) return;
        setData(json);
        setError(undefined);
        setIsStale(false);
        setLastUpdated(Date.now());
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsStale(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchData();
    const id = setInterval(fetchData, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [url, intervalMs]);

  return { data, error, isLoading, isStale, lastUpdated };
}
