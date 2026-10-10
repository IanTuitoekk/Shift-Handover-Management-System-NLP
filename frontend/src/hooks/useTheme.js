import { useCallback, useState } from 'react';

const KEY = 'kq-theme';

function readTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Dark is the default. index.html applies the stored choice before first paint. */
export function useTheme() {
  const [theme, setTheme] = useState(readTheme);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = next === 'dark' ? '#141b24' : '#fbfcfd';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Not persisted; still applies for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
