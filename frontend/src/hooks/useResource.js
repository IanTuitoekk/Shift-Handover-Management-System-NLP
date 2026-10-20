import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetches data for `key` and refetches when the key changes or `reload()` is called.
 * Previous data stays visible while a refetch is in flight, so lists don't flash.
 * Pass `null` as the key to skip fetching entirely.
 */
export function useResource(key, fetcher) {
  const fetcherRef = useRef(fetcher);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  const requestKey = `${key}#${nonce}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setState({ key: requestKey, data, error: null });
      },
      (error) => {
        if (!cancelled) setState((prev) => ({ key: requestKey, data: prev.data, error }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback((update) => setState((prev) => ({ ...prev, data: update(prev.data) })), []);

  return {
    data: state.data,
    error: state.error,
    loading: key !== null && state.key !== requestKey,
    reload,
    mutate,
  };
}

/** Calls `callback` every `ms` while the tab is visible. */
export function useInterval(callback, ms) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') callbackRef.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Calls `callback` when the tab becomes visible again or the window regains focus. */
export function useRefetchOnFocus(callback) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    let last = 0;
    const run = () => {
      // Focus and visibility often fire together; skip duplicates within a second.
      if (document.visibilityState !== 'visible' || Date.now() - last < 1000) return;
      last = Date.now();
      callbackRef.current();
    };
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);
}
