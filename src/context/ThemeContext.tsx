import React, { createContext, useContext, useState, useEffect } from 'react';
import { Store, ShoppingBag, Package } from 'lucide-react';
import { Theme } from '../types';

const themes: Record<string, Theme> = {
  old: {
    name: 'old',
    colors: {
      primary: 'rgb(79, 70, 229)',
      secondary: 'rgb(99, 102, 241)',
      background: 'rgb(249, 250, 251)',
      surface: 'rgb(255, 255, 255)',
      text: 'rgb(17, 24, 39)',
      textSecondary: 'rgb(107, 114, 128)',
      accent: 'rgb(79, 70, 229)',
      border: 'rgb(229, 231, 235)',
    },
    hero: {
      backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
      headlineColor: 'rgb(255, 255, 255)',
      subheadingColor: 'rgb(229, 231, 235)',
    },
    logo: {
      icon: 'Store',
      color: 'rgb(79, 70, 229)',
    },
  },
  light: {
    name: 'light',
    colors: {
      primary: 'rgb(239, 68, 68)',
      secondary: 'rgb(99, 102, 241)',
      background: 'rgb(249, 250, 251)',
      surface: 'rgb(255, 255, 255)',
      text: 'rgb(17, 24, 39)',
      textSecondary: 'rgb(107, 114, 128)',
      accent: 'rgb(239, 68, 68)',
      border: 'rgb(229, 231, 235)',
    },
    hero: {
      backgroundImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
      headlineColor: 'rgb(255, 255, 255)',
      subheadingColor: 'rgb(229, 231, 235)',
    },
    logo: {
      icon: 'Store',
      color: 'rgb(239, 68, 68)',
    },
  },
  dark: {
    name: 'dark',
    colors: {
      primary: 'rgb(239, 68, 68)',
      secondary: 'rgb(234, 179, 8)',
      background: 'rgb(17, 24, 39)',
      surface: 'rgb(31, 41, 55)',
      text: 'rgb(243, 244, 246)',
      textSecondary: 'rgb(156, 163, 175)',
      accent: 'rgb(239, 68, 68)',
      border: 'rgb(55, 65, 81)',
    },
    hero: {
      backgroundImage: 'https://images.unsplash.com/photo-1508615039623-a25605d2b022',
      headlineColor: 'rgb(239, 68, 68)',
      subheadingColor: 'rgb(234, 179, 8)',
    },
    logo: {
      icon: 'Package',
      color: 'rgb(239, 68, 68)',
    },
  },
};

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({
  theme: themes.light,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(themes.light);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && themes[savedTheme]) {
      setTheme(themes[savedTheme]);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme.name === 'light' ? themes.dark : themes.light;
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme.name);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const ThemeIcon: React.FC<{ name: Theme['logo']['icon'] }> = ({ name }) => {
  const icons = {
    Store,
    ShoppingBag,
    Package,
  };
  const Icon = icons[name];
  return <Icon />;
};