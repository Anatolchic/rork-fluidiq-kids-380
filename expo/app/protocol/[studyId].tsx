import { router, Stack, useLocalSearchParams } from "expo-router";
import { Copy, Share2, X } from "lucide-react-native";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { showAlert } from "@/utils/alert";

export default function ProtocolScreen() {
  const { t } = useTranslation();
  const { studyId, patientId } = useLocalSearchParams<{ studyId: string; patientId: string }>();
  const { getPatientById } = usePatients();
  const patient = getPatientById(patientId!);

  if (!patient) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("protocol.patientNotFound")}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("common.back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const study = patient.studies.find((s) => s.id === studyId);

  if (!study) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("protocol.notFound")}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("common.back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleCopy = async () => {
    await Clipboard.setStringAsync(study.protocol);
    showAlert(t("protocol.successTitle"), t("protocol.protocolCopied"));
  };

  const handleShare = async () => {
    try {
      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({
            title: `${t("protocol.title")} - ${patient.patientId}`,
            text: study.protocol,
          });
        } else {
          await Clipboard.setStringAsync(study.protocol);
          showAlert(t("protocol.successTitle"), t("protocol.protocolCopied"));
        }
      } else {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          const fileName = `protocol_${patient.patientId}_${study.id}.txt`;
          const file = new File(Paths.cache, fileName);
          file.write(study.protocol);

          await Sharing.shareAsync(file.uri, {
            mimeType: "text/plain",
            dialogTitle: `${t("protocol.title")} - ${patient.patientId}`,
            UTI: "public.plain-text",
          });
        } else {
          await Clipboard.setStringAsync(study.protocol);
          showAlert(t("protocol.successTitle"), t("protocol.protocolCopied"));
        }
      }
    } catch (error) {
      console.error("Error sharing protocol:", error);
      await Clipboard.setStringAsync(study.protocol);
      showAlert(t("common.error"), t("protocol.shareError"));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X color={CyberpunkTheme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("protocol.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.protocolCard}>
          <Text style={styles.protocolText}>{study.protocol}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
          <Copy color={CyberpunkTheme.colors.neonCyan} size={20} />
          <Text style={styles.actionButtonText}>{t("common.copy")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Share2 color={CyberpunkTheme.colors.neonPink} size={20} />
          <Text style={styles.actionButtonText}>{t("common.share")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: CyberpunkTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CyberpunkTheme.colors.cardBorder,
  },
  closeButton: {
    padding: CyberpunkTheme.spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
  },
  content: {
    flex: 1,
    padding: CyberpunkTheme.spacing.md,
  },
  protocolCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.lg,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  protocolText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.text,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  footer: {
    flexDirection: "row",
    padding: CyberpunkTheme.spacing.md,
    gap: CyberpunkTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: CyberpunkTheme.colors.cardBorder,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: CyberpunkTheme.spacing.sm,
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: CyberpunkTheme.spacing.xl,
  },
  errorText: {
    fontSize: 18,
    color: CyberpunkTheme.colors.error,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  backButton: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    paddingVertical: CyberpunkTheme.spacing.sm,
    paddingHorizontal: CyberpunkTheme.spacing.lg,
    borderRadius: CyberpunkTheme.borderRadius.md,
  },
  backButtonText: {
    color: CyberpunkTheme.colors.background,
    fontWeight: "700" as const,
  },
});
