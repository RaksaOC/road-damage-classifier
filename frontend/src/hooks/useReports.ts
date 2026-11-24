"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportSort, ReportSummary } from "@/domain/report";
import { errorMessage, services } from "@/services";

const PAGE = 8;

/* Anything that changes the saved reports calls reportsChanged(), and every open list reloads. */
const listeners = new Set<() => void>();
export const reportsChanged = () => listeners.forEach((l) => l());

type Status = "loading" | "ready" | "more" | "error";

/** Server-side search, sort and paging, with loadMore() for infinite scroll. */
export function useReports(q: string, sort: ReportSort) {
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const busy = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      busy.current?.abort();
      const ctl = (busy.current = new AbortController());
      setStatus(offset === 0 ? "loading" : "more");
      setError(null);
      try {
        const page = await services.reports.list({ q, sort, limit: PAGE, offset }, { signal: ctl.signal });
        setItems((old) => (offset === 0 ? page.items : [...old, ...page.items]));
        setTotal(page.total);
        setNext(page.nextOffset);
        setStatus("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(errorMessage(e));
        setStatus("error");
      }
    },
    [q, sort],
  );

  // a new search, sort or saved/deleted report starts again from the first page (search waits for typing to pause)
  useEffect(() => {
    const t = setTimeout(() => fetchPage(0), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchPage, version, q]);

  useEffect(() => {
    const l = () => setVersion((v) => v + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  useEffect(() => () => busy.current?.abort(), []);

  const loadMore = useCallback(() => {
    if (next !== null && status === "ready") fetchPage(next);
  }, [next, status, fetchPage]);

  const retry = useCallback(() => fetchPage(items.length && status === "error" ? items.length : 0), [fetchPage, items.length, status]);

  return { items, total, hasMore: next !== null, status, error, loadMore, retry };
}
