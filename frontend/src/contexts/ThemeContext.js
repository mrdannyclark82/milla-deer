import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import API from '../api';

const ThemeContext = createContext(null);

const THEMES = [
  { id: 'midnight', label: 'Midnight Cinematic', icon: 'moon' },
  { id: 'serenity', label: 'Serenity', icon: 'sun' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: 'zap' },
  { id: 'aurora', label: 'Aurora', icon: 'sparkles' },
];

export function ThemeProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('elara_theme') || 'midnight';
  });

  useEffect(() => {
    if (user && user.theme) {
      setThemeState(user.theme);
    }
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'midnight') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem('elara_theme', theme);
  }, [theme]);

  const setTheme = useCallback(async (newTheme) => {
    setThemeState(newTheme);
    if (user) {
      try {
        await API.put('/api/preferences/theme', { theme: newTheme });
        updateUser({ theme: newTheme });
      } catch (e) { /* ignore */ }
    }
  }, [user, updateUser]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
