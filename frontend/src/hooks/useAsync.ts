"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/services";

export type Async<T> = { status: "loading"; data?: undefined; error?: undefined } | { status: "ready"; data: T; error?: undefined } | { status: "error"; data?: undefined; error: string };

/** Runs a load function on mount (and when deps change), with a reload for "Try again" buttons. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): Async<T> & { reload: () => void } {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [n, setN] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load().then(
      (data) => live && setState({ status: "ready", data }),
      (e) => live && setState({ status: "error", error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);

  return { ...state, reload: useCallback(() => setN((x) => x + 1), []) };
}
