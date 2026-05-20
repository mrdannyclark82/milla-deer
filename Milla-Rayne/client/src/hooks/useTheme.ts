import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'cyberpunk';

const STORAGE_KEY = 'milla-theme';
const DEFAULT_THEME: Theme = 'cyberpunk';

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'light', 'cyberpunk');
  root.classList.add(theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored && ['dark', 'light', 'cyberpunk'].includes(stored)
      ? stored
      : DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}
