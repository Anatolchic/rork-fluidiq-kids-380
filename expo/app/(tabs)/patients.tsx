import { router, Stack } from "expo-router";
import { Trash2, UserPlus, Settings } from "lucide-react-native";
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { Patient, VExUSStudy } from "@/types/medical";
import { showAlert } from "@/utils/alert";
import { getScoreText } from "@/utils/scoreText";
import { useSettings } from "@/contexts/SettingsContext";
import { getTheme } from "@/constants/themes";

export default function PatientsScreen() {
  const { patients, deletePatient } = usePatients();
  const { settings } = useSettings();
  const theme = getTheme(settings.theme);
  const { t } = useTranslation();

  const handleDelete = (patient: Patient) => {
    showAlert(
      t('patients.deletePatientTitle'),
      t('patients.deletePatientMessage', { id: patient.patientId }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            await deletePatient(patient.id);
          },
        },
      ]
    );
  };

  const renderPatient = ({ item }: { item: Patient }) => {
    const lastStudy = item.studies[0];
    const lastStudyDate = lastStudy
      ? new Date(lastStudy.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')
      : t('patients.noStudy');
    const genderColor = item.gender === "male" ? CyberpunkTheme.colors.neonCyan : CyberpunkTheme.colors.neonPink;

    let conclusionText = "";
    let isPositive = false;

    if (lastStudy) {
      const conclusion = lastStudy.conclusion;
      if (lastStudy.protocolType === "responder") {
        conclusionText = conclusion === "responder" ? t('patient.responder') : t('patient.nonResponder');
        isPositive = conclusion === "responder";
      } else if (lastStudy.protocolType === "vexus") {
        const vStudy = lastStudy as VExUSStudy;
        const score = vStudy.totalScore ?? vStudy.vexusParameters?.totalScore;
        const scoreStr = score !== undefined ? ` (${getScoreText(score, t)})` : "";
        if (conclusion === "grade-0") {
          conclusionText = t("vexus.grade0") + scoreStr + " (p-VExUS)";
          isPositive = true;
        } else if (conclusion === "grade-1") {
          conclusionText = t("vexus.grade1") + scoreStr + " (p-VExUS)";
          isPositive = false;
        } else if (conclusion === "grade-2") {
          conclusionText = t("vexus.grade2") + scoreStr + " (p-VExUS)";
          isPositive = false;
        } else if (conclusion === "grade-3") {
          conclusionText = t("vexus.grade3") + scoreStr + " (p-VExUS)";
          isPositive = false;
        }
      } else if (lastStudy.protocolType === "plr") {
        const suffix = " (LVOT VTI + PLR)";
        conclusionText = conclusion === "responder" ? t('patient.responder') + suffix : t('patient.nonResponder') + suffix;
        isPositive = conclusion === "responder";
      } else if (lastStudy.protocolType === "blines") {
        if (conclusion === "no-edema") {
          conclusionText = t("blines.noEdema").toUpperCase() + " (B-lines)";
        } else if (conclusion === "mild-edema") {
          conclusionText = t("blines.mildEdema").toUpperCase() + " (B-lines)";
        } else if (conclusion === "moderate-edema") {
          conclusionText = t("blines.moderateEdema").toUpperCase() + " (B-lines)";
        } else if (conclusion === "severe-edema") {
          conclusionText = t("blines.severeEdema").toUpperCase() + " (B-lines)";
        } else if (conclusion === "not-informative") {
          conclusionText = "НЕИНФОРМАТИВНО (B-lines)";
        } else if (conclusion === "probably-non-hydrostatic") {
          conclusionText = "НЕГИДРОСТАТИЧЕСКИЙ ОТЁК (B-lines)";
        }
        isPositive = false;
      }
    }

    return (
      <TouchableOpacity
        style={styles.patientCard}
        onPress={() => router.replace(`/(tabs)/patient/${item.id}`)}
      >
        <View style={[styles.genderIndicator, { backgroundColor: genderColor }]} />
        <View style={styles.patientInfo}>
          <Text style={styles.patientId}>ID: {item.patientId}</Text>
          <Text style={styles.patientMeta}>
            {t('patients.lastStudy')}: {lastStudyDate}
          </Text>
          {lastStudy && (
            <View style={styles.resultBadge}>
              <Text
                style={[
                  styles.resultText,
                  isPositive && styles.resultResponder,
                ]}
              >
                {conclusionText}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
          >
            <Trash2 color={CyberpunkTheme.colors.error} size={20} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{
          title: t('tabs.patients'),
          headerRight: () => (
            <TouchableOpacity 
              onPress={() => router.push("/settings")} 
              style={{ marginRight: 8 }}
            >
              <Settings color={theme.colors.text} size={24} />
            </TouchableOpacity>
          ),
        }}
      />
      {patients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('patients.noPatients')}</Text>
          <Text style={styles.emptySubtext}>
            {t('patients.noPatientsSubtext')}
          </Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => router.push("/(tabs)/add-patient")}
          >
            <UserPlus color={CyberpunkTheme.colors.background} size={20} />
            <Text style={styles.addButtonText}>{t('patients.addPatient')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={patients}
          renderItem={renderPatient}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  listContent: {
    padding: CyberpunkTheme.spacing.md,
  },
  patientCard: {
    flexDirection: "row",
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: "rgba(200, 200, 200, 0.3)",
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    overflow: "hidden",
    ...CyberpunkTheme.shadows.cardGlow,
  },
  genderIndicator: {
    width: 4,
    marginRight: CyberpunkTheme.spacing.sm,
    borderRadius: 2,
  },
  patientInfo: {
    flex: 1,
  },
  patientId: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  patientMeta: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  resultBadge: {
    alignSelf: "flex-start",
    marginTop: CyberpunkTheme.spacing.xs,
  },
  resultText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.error,
  },
  resultResponder: {
    color: CyberpunkTheme.colors.success,
  },
  actions: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.sm,
  },
  actionButton: {
    padding: CyberpunkTheme.spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: CyberpunkTheme.spacing.xl,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.sm,
  },
  emptySubtext: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
    textAlign: "center",
    marginBottom: CyberpunkTheme.spacing.xl,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: CyberpunkTheme.spacing.sm,
    backgroundColor: CyberpunkTheme.colors.neonPink,
    paddingVertical: CyberpunkTheme.spacing.md,
    paddingHorizontal: CyberpunkTheme.spacing.lg,
    borderRadius: CyberpunkTheme.borderRadius.md,
    ...CyberpunkTheme.shadows.neonPink,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
});
