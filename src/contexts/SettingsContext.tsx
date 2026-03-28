import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AppSettings {
  darkMode: boolean;
  crossfade: boolean;
  normalizeVolume: boolean;
  showExplicit: boolean;
  dataSaver: boolean;
  notifications: boolean;
}

interface SettingsContextType extends AppSettings {
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const defaultSettings: AppSettings = {
  darkMode: true,
  crossfade: false,
  normalizeVolume: false,
  showExplicit: true,
  dataSaver: false,
  notifications: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('melodiya-settings');
      if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
    } catch {}
    return defaultSettings;
  });

  // Apply dark mode class
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [settings.darkMode]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('melodiya-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};
