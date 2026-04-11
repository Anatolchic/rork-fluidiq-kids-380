import { Tabs } from "expo-router";
import { Users, UserPlus, BookOpen } from "lucide-react-native";
import React from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { getTheme } from "@/constants/themes";
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { settings } = useSettings();
  const theme = getTheme(settings.theme);
  const { t } = useTranslation();
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.neonCyan,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.cardBorder,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="patients"
        options={{
          title: t('tabs.patients'),
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="add-patient"
        options={{
          title: t('tabs.addPatient'),
          tabBarIcon: ({ color, size }) => <UserPlus color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="materials"
        options={{
          title: t('tabs.materials'),
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="patient"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
