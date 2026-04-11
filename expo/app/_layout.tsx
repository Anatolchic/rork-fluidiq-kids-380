import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform, Animated, StyleSheet } from "react-native";
import { PatientsProvider } from "@/contexts/PatientsContext";
import { SettingsContext, useSettings } from "@/contexts/SettingsContext";
import '@/locales/i18n';
import { useTranslation } from 'react-i18next';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { settings } = useSettings();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== settings.language) {
      void i18n.changeLanguage(settings.language);
    }
  }, [settings.language, i18n]);

  return (
    <Stack 
      screenOptions={{ headerBackTitle: t('common.back') }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />

      <Stack.Screen
        name="protocol/[studyId]"
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const fadeAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    const prepare = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      setAppReady(true);
    };

    void prepare();
  }, []);

  useEffect(() => {
    if (appReady) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        void SplashScreen.hideAsync();
      });
    }
  }, [appReady, fadeAnim]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `
        html, body, #root {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: fixed;
          overscroll-behavior: none;
        }
        body {
          margin: 0;
          padding: 0;
        }
        * {
          -webkit-overflow-scrolling: touch;
        }
      `;
      document.head.appendChild(style);
      
      const metaViewport = document.querySelector('meta[name=viewport]');
      if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      } else {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        document.head.appendChild(meta);
      }
      
      const metaApple = document.querySelector('meta[name=apple-mobile-web-app-capable]');
      if (!metaApple) {
        const apple = document.createElement('meta');
        apple.name = 'apple-mobile-web-app-capable';
        apple.content = 'yes';
        document.head.appendChild(apple);
      }
      
      const metaAppleStatus = document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]');
      if (!metaAppleStatus) {
        const appleStatus = document.createElement('meta');
        appleStatus.name = 'apple-mobile-web-app-status-bar-style';
        appleStatus.content = 'black-translucent';
        document.head.appendChild(appleStatus);
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsContext>
        <PatientsProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
            {!appReady && (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: '#0B1623',
                    opacity: fadeAnim,
                  },
                ]}
                pointerEvents="none"
              />
            )}
          </GestureHandlerRootView>
        </PatientsProvider>
      </SettingsContext>
    </QueryClientProvider>
  );
}
