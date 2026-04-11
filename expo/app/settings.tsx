import { router, Stack } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { ExternalLink, Shield, ArrowLeft, Check, Globe } from "lucide-react-native";
import { useSettings } from "@/contexts/SettingsContext";
import { getTheme } from "@/constants/themes";
import { useTranslation } from 'react-i18next';
import type { Language } from '@/contexts/SettingsContext';

export default function SettingsScreen() {
  const { settings, setLanguage } = useSettings();
  const theme = getTheme(settings.theme);
  const { t, i18n } = useTranslation();

  const handleContactDeveloper = () => {
    void Linking.openURL("https://t.me/shchuchko");
  };

  const handleLanguageChange = (language: Language) => {
    setLanguage(language);
    void i18n.changeLanguage(language);
  };

  const languages: { code: Language; label: string }[] = [
    { code: 'ru', label: t('settings.languageRu') },
    { code: 'en', label: t('settings.languageEn') },
    { code: 'de', label: t('settings.languageDe') },
    { code: 'es', label: t('settings.languageEs') },
    { code: 'fr', label: t('settings.languageFr') },
    { code: 'zh', label: t('settings.languageZh') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{ 
          headerShown: true,
          title: t('settings.title'),
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 0 }}>
              <ArrowLeft color={theme.colors.text} size={24} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Globe color={theme.colors.neonCyan} size={24} />
            <Text style={[styles.sectionTitle, { color: theme.colors.neonCyan }]}>
              {t('settings.language')}
            </Text>
          </View>
          
          <View style={styles.languageContainer}>
            {languages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageCard,
                  {
                    backgroundColor: theme.colors.cardBackground,
                    borderColor: settings.language === lang.code ? theme.colors.neonCyan : theme.colors.cardBorder,
                    borderWidth: settings.language === lang.code ? 2 : 1,
                  },
                  settings.language === lang.code && {
                    shadowColor: theme.colors.neonCyan,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 8,
                    elevation: 4,
                  },
                ]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text
                  style={[
                    styles.languageText,
                    {
                      color: settings.language === lang.code ? theme.colors.neonCyan : theme.colors.text,
                      fontWeight: settings.language === lang.code ? '700' : '600',
                    },
                  ]}
                >
                  {lang.label}
                </Text>
                {settings.language === lang.code && (
                  <Check color={theme.colors.neonCyan} size={20} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield color={theme.colors.neonPurple} size={24} />
            <Text style={[styles.sectionTitle, { color: theme.colors.neonPurple }]}>
              {t('settings.dataSecurityTitle')}
            </Text>
          </View>
          
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.cardBackground,
                borderColor: theme.colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.infoText, { color: theme.colors.text }]}>
              {t('settings.dataSecurityDescription1')}
            </Text>
            <Text style={[styles.infoText, { color: theme.colors.text, marginTop: theme.spacing.md }]}>
              {t('settings.dataSecurityDescription2')}
            </Text>
            <View
              style={[
                styles.infoHighlight,
                {
                  backgroundColor: `${theme.colors.success}20`,
                  borderColor: theme.colors.success,
                  marginTop: theme.spacing.md,
                },
              ]}
            >
              <Text style={[styles.infoHighlightText, { color: theme.colors.success }]}>
                ✓ {t('settings.localStorageLabel')}
              </Text>
              <Text style={[styles.infoHighlightText, { color: theme.colors.success }]}>
                ✓ {t('settings.noInternetLabel')}
              </Text>
              <Text style={[styles.infoHighlightText, { color: theme.colors.success }]}>
                ✓ {t('settings.privacyLabel')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ExternalLink color={theme.colors.text} size={24} />
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {t('settings.developerContactTitle')}
            </Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.contactCard,
              {
                backgroundColor: theme.colors.cardBackground,
                borderColor: theme.colors.neonCyan,
              },
            ]}
            onPress={handleContactDeveloper}
          >
            <Text style={[styles.contactText, { color: theme.colors.text }]}>
              {t('settings.contactTelegram')}
            </Text>
            <Text style={[styles.contactHandle, { color: theme.colors.neonCyan }]}>
              @shchuchko
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.logoSection}>
          <Image
            source={require("@/assets/images/kids-logo.jpg")}
            style={styles.logo}
            contentFit="contain"
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            {t('settings.appVersion')}
          </Text>
          <Text style={[styles.footerText, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}>
            {t('settings.appDescription')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  optionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 12,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  infoCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: "#bd00ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoHighlight: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoHighlightText: {
    fontSize: 14,
    fontWeight: "600" as const,
    marginVertical: 4,
  },
  contactCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    shadowColor: "#559DBD",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  contactText: {
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  contactHandle: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  logoSection: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: 20,
  },
  footer: {
    alignItems: "center",
    padding: 32,
  },
  footerText: {
    fontSize: 12,
  },
  languageContainer: {
    gap: 12,
  },
  languageCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
  },
  languageText: {
    fontSize: 16,
  },
});
