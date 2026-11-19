import { useState, useEffect, useRef, useCallback } from "react";
import { fetchPrices, applyPrices, quoteTargets } from "../lib/refresh";
import { DEFAULT_REFRESH_MINUTES, refreshDelay } from "../lib/refresh-settings";
export default function useAutoRefresh(state, setState) {
  const latest = useRef(state),
    busyRef = useRef(false),
    lastAttempt = useRef(0),
    controller = useRef(null),
    alive = useRef(true),
    [status, setStatus] = useState({
      busy: false,
      errors: [],
      lastSuccess: null,
    });
  latest.current = state;
  const refresh = useCallback(async () => {
    if (busyRef.current || !quoteTargets(latest.current).length) return;
    busyRef.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStatus((s) => ({ ...s, busy: true, errors: [] }));
    try {
      const result = await fetchPrices(latest.current, {
        signal: abort.signal,
      });
      if (!alive.current || abort.signal.aborted) return;
      setState((current) => applyPrices(current, result.quotes));
      setStatus({
        busy: false,
        errors: result.errors,
        lastSuccess: Object.keys(result.quotes).length
          ? new Date().toISOString()
          : null,
      });
    } catch (e) {
      if (alive.current && !abort.signal.aborted)
        setStatus((s) => ({ ...s, busy: false, errors: [e.message] }));
    } finally {
      if (controller.current === abort) {
        if (!abort.signal.aborted) lastAttempt.current = Date.now();
        busyRef.current = false;
      }
    }
  }, [setState]);
  const hasTargets = quoteTargets(state).length > 0;
  const { autoRefresh, lastRefresh } = state;
  const minutes = state.refreshMinutes ?? DEFAULT_REFRESH_MINUTES;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      busyRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!autoRefresh || !hasTargets || status.busy) return;
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      if (!navigator.onLine || busyRef.current) return;
      const lastCheck = Math.max(
        Date.parse(lastRefresh) || 0,
        lastAttempt.current,
      );
      timer = setTimeout(
        () => {
          if (navigator.onLine) void refresh();
        },
        refreshDelay(lastCheck, minutes),
      );
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("online", schedule);
    };
  }, [autoRefresh, hasTargets, lastRefresh, minutes, refresh, status.busy]);
  return { ...status, refresh };
}
