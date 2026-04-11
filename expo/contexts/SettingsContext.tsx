import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import createContextHook from "@nkzw/create-context-hook";

export type Theme = "default" | "light" | "ocean";
export type Language = "ru" | "en" | "de" | "es" | "fr" | "zh";

interface Settings {
  theme: Theme;
  language: Language;
}

const SETTINGS_KEY = "@FluidIQ:settings";

export const [SettingsContext, useSettings] = createContextHook(() => {
  const [settings, setSettings] = useState<Settings>({
    theme: "default",
    language: "ru",
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored && stored.trim().length > 0) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && 'theme' in parsed && 'language' in parsed) {
            setSettings(parsed);
          } else {
            console.error("Stored settings have invalid format, resetting...");
            await AsyncStorage.removeItem(SETTINGS_KEY);
          }
        } catch (parseError) {
          console.error("Error parsing settings JSON:", parseError, "Data:", stored);
          await AsyncStorage.removeItem(SETTINGS_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const setTheme = useCallback((theme: Theme) => {
    saveSettings({ ...settings, theme });
  }, [settings]);

  const setLanguage = useCallback((language: Language) => {
    saveSettings({ ...settings, language });
  }, [settings]);

  return useMemo(() => ({
    settings,
    isLoading,
    setTheme,
    setLanguage,
  }), [settings, isLoading, setTheme, setLanguage]);
});
