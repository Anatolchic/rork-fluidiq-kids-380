import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Trash2, ChevronDown, ChevronUp, Info } from "lucide-react-native";
import { useState, useEffect, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { showAlert } from "@/utils/alert";
import {
  PLRParameters,
  PLRPreConditions,
  ResponderStatus,
} from "@/types/medical";

export default function PLRStudyScreen() {
  const { t, i18n } = useTranslation();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const insets = useSafeAreaInsets();
  const { getPatientById, addStudy } = usePatients();
  const patient = getPatientById(patientId!);

  const [preConditions, setPreConditions] = useState<PLRPreConditions>({
    normalICP: false,
    canPerformPLR: false,
  });

  const [parameters, setParameters] = useState<PLRParameters>({
    beforePLR: [
      { value: "" },
      { value: "" },
      { value: "" },
      { value: "" },
      { value: "" },
    ],
    afterPLR: [],
  });

  const [currentStage, setCurrentStage] = useState<"before" | "after" | "completed">("before");
  const [expandedSections, setExpandedSections] = useState<{
    before: boolean;
    after: boolean;
  }>({
    before: true,
    after: false,
  });

  useEffect(() => {
    console.log("PLR study screen mounted for patient:", patientId);
    if (patient) {
      setPreConditions({
        normalICP: false,
        canPerformPLR: false,
      });
      setParameters({
        beforePLR: [
          { value: "" },
          { value: "" },
          { value: "" },
          { value: "" },
          { value: "" },
        ],
        afterPLR: [],
      });
      setCurrentStage("before");
      setExpandedSections({ before: true, after: false });
    }
  }, [patientId]);

  const conditionsValid = preConditions.normalICP && preConditions.canPerformPLR;

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(',', '.');
  };

  const calculateAverage = (measurements: { value: string }[]): number | undefined => {
    const validValues = measurements
      .map(m => parseFloat(normalizeDecimalInput(m.value)))
      .filter(v => !isNaN(v) && v > 0);

    if (validValues.length < 5) {
      return undefined;
    }

    const sum = validValues.reduce((acc, val) => acc + val, 0);
    return sum / validValues.length;
  };

  const calculateVariability = (avgBefore: number | undefined, avgAfter: number | undefined): number | undefined => {
    if (avgBefore === undefined || avgAfter === undefined || avgBefore === 0) {
      return undefined;
    }

    return Math.abs(((avgAfter - avgBefore) / avgBefore) * 100);
  };

  const averageBeforePLR = useMemo(() => calculateAverage(parameters.beforePLR), [parameters.beforePLR]);
  const averageAfterPLR = useMemo(() => calculateAverage(parameters.afterPLR), [parameters.afterPLR]);
  const variability = useMemo(() => calculateVariability(averageBeforePLR, averageAfterPLR), [averageBeforePLR, averageAfterPLR]);

  const conclusion: ResponderStatus = useMemo(() => {
    if (variability === undefined) {
      return "not-assessed";
    }
    return variability >= 12 ? "responder" : "non-responder";
  }, [variability]);

  const updateMeasurement = (stage: "before" | "after", index: number, value: string) => {
    if (stage === "before") {
      const newMeasurements = [...parameters.beforePLR];
      newMeasurements[index] = { value };
      setParameters(prev => ({ ...prev, beforePLR: newMeasurements }));
    } else {
      const newMeasurements = [...parameters.afterPLR];
      newMeasurements[index] = { value };
      setParameters(prev => ({ ...prev, afterPLR: newMeasurements }));
    }
  };



  const removeMeasurement = (stage: "before" | "after", index: number) => {
    if (stage === "before" && parameters.beforePLR.length > 5) {
      const newMeasurements = parameters.beforePLR.filter((_, i) => i !== index);
      setParameters(prev => ({ ...prev, beforePLR: newMeasurements }));
    } else if (stage === "after" && parameters.afterPLR.length > 5) {
      const newMeasurements = parameters.afterPLR.filter((_, i) => i !== index);
      setParameters(prev => ({ ...prev, afterPLR: newMeasurements }));
    }
  };

  const handleContinue = () => {
    const filledCount = parameters.beforePLR.filter(m => {
      const val = parseFloat(normalizeDecimalInput(m.value));
      return !isNaN(val) && val > 0;
    }).length;

    if (filledCount < 5) {
      showAlert(t("common.error"), t("plr.minMeasurements"));
      return;
    }

    setCurrentStage("after");
    setExpandedSections({ before: false, after: true });
    if (parameters.afterPLR.length === 0) {
      setParameters(prev => ({
        ...prev,
        afterPLR: [
          { value: "" },
          { value: "" },
          { value: "" },
          { value: "" },
          { value: "" },
        ],
      }));
    }
  };

  const handleFinish = () => {
    const filledBeforeCount = parameters.beforePLR.filter(m => {
      const val = parseFloat(normalizeDecimalInput(m.value));
      return !isNaN(val) && val > 0;
    }).length;

    const filledAfterCount = parameters.afterPLR.filter(m => {
      const val = parseFloat(normalizeDecimalInput(m.value));
      return !isNaN(val) && val > 0;
    }).length;

    if (filledBeforeCount < 5 || filledAfterCount < 5) {
      showAlert(t("common.error"), t("plr.minMeasurementsBoth"));
      return;
    }

    setCurrentStage("completed");
  };

  const generatePLRProtocol = (): string => {
    const date = new Date();
    const dateStr = date.toLocaleDateString(i18n.language === "ru" ? "ru-RU" : "en-US");
    const timeStr = date.toLocaleTimeString(i18n.language === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let protocol = `${t("plr.title")}\n\n`;
    protocol += `${t("study.title")}: ${dateStr} ${timeStr}\n`;
    protocol += `${t("patient.patientId")}: ${patient!.patientId}\n`;
    protocol += `${t("patient.gender")}: ${patient!.gender === "male" ? t("common.male") : t("common.female")}\n\n`;

    protocol += `${t("plr.beforePLRTitle")}:\n`;
    parameters.beforePLR.forEach((m, i) => {
      if (m.value) {
        protocol += `${i + 1}. LVOT VTI: ${m.value} cm\n`;
      }
    });
    if (averageBeforePLR !== undefined) {
      protocol += `${t("plr.averageBefore")}: ${averageBeforePLR.toFixed(2)} cm\n\n`;
    }

    if (parameters.afterPLR.length > 0) {
      protocol += `${t("plr.afterPLRTitle")}:\n`;
      parameters.afterPLR.forEach((m, i) => {
        if (m.value) {
          protocol += `${i + 1}. LVOT VTI: ${m.value} cm\n`;
        }
      });
      if (averageAfterPLR !== undefined) {
        protocol += `${t("plr.averageAfter")}: ${averageAfterPLR.toFixed(2)} cm\n\n`;
      }
    }

    if (variability !== undefined) {
      protocol += `${t("plr.variability")}: ${variability.toFixed(1)}%\n\n`;
    }

    protocol += `${t("plr.conclusionTitle")}: `;
    if (conclusion === "responder") {
      protocol += `${t("plr.responder")}`;
    } else if (conclusion === "non-responder") {
      protocol += `${t("plr.nonResponder")}`;
    } else {
      protocol += t("plr.notAssessed");
    }

    return protocol;
  };

  const handleSave = async () => {
    if (!patient) return;

    if (!conditionsValid) {
      showAlert(t("common.error"), t("plr.conditionsNotMet"));
      return;
    }

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generatePLRProtocol();

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "plr" as const,
      plrParameters: {
        ...parameters,
        averageBeforePLR,
        averageAfterPLR,
        variability,
      },
      plrPreConditions: preConditions,
      conclusion,
      protocol,
    };

    await addStudy(patient.id, newStudy);

    showAlert(t("study.successTitle"), t("plr.studySaved"), [
      {
        text: t("common.ok"),
        onPress: () => {
          router.replace(`/(tabs)/patient/${patient.id}`);
        },
      },
    ]);
  };

  const handleCopy = async () => {
    if (!patient || !conditionsValid) return;

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generatePLRProtocol();

    await Clipboard.setStringAsync(protocol);

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "plr" as const,
      plrParameters: {
        ...parameters,
        averageBeforePLR,
        averageAfterPLR,
        variability,
      },
      plrPreConditions: preConditions,
      conclusion,
      protocol,
    };

    await addStudy(patient.id, newStudy);

    showAlert(t("study.successTitle"), t("plr.protocolCopied"));
  };

  if (!patient) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundText}>{t("study.notFound")}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t("common.back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const hasValidMeasurement = conclusion !== "not-assessed";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIconButton}>
          <ArrowLeft color={CyberpunkTheme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("plr.title")}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientInfoText}>
            ID: {patient.patientId} |{" "}{patient.gender === "male" ? t("common.male").charAt(0) : t("common.female").charAt(0)}
          </Text>
        </View>

        <View style={styles.conditionsCard}>
          <Text style={styles.conditionsTitle}>{t("plr.conditionsTitle")}</Text>

          <View style={styles.importantNoteBox}>
            <Info color={CyberpunkTheme.colors.neonCyan} size={20} />
            <Text style={styles.importantNoteText}>{t("plr.importantNote")}</Text>
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("plr.normalICP")}</Text>
            <Switch
              value={preConditions.normalICP}
              onValueChange={(value) =>
                setPreConditions((prev) => ({ ...prev, normalICP: value }))
              }
              trackColor={{
                false: CyberpunkTheme.colors.cardBorder,
                true: CyberpunkTheme.colors.neonCyan,
              }}
              thumbColor={preConditions.normalICP ? CyberpunkTheme.colors.text : "#FFFFFF"}
            />
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("plr.canPerformPLR")}</Text>
            <Switch
              value={preConditions.canPerformPLR}
              onValueChange={(value) =>
                setPreConditions((prev) => ({ ...prev, canPerformPLR: value }))
              }
              trackColor={{
                false: CyberpunkTheme.colors.cardBorder,
                true: CyberpunkTheme.colors.neonCyan,
              }}
              thumbColor={preConditions.canPerformPLR ? CyberpunkTheme.colors.text : "#FFFFFF"}
            />
          </View>

          {!conditionsValid && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>{t("plr.conditionsNotMet")}</Text>
            </View>
          )}
        </View>

        {conditionsValid && (
          <>
            <View style={styles.sectionHeader}>
              <TouchableOpacity
                style={[
                  styles.collapsibleHeader,
                  averageBeforePLR !== undefined && styles.collapsibleHeaderCompleted,
                ]}
                onPress={() => setExpandedSections(prev => ({ ...prev, before: !prev.before }))}
              >
                <Text style={[
                  styles.sectionTitle,
                  averageBeforePLR !== undefined && styles.sectionTitleCompleted,
                ]}>
                  1. {t("plr.beforePLRTitle")}
                </Text>
                {expandedSections.before ? (
                  <ChevronUp color={CyberpunkTheme.colors.neonCyan} size={24} />
                ) : (
                  <ChevronDown color={CyberpunkTheme.colors.neonCyan} size={24} />
                )}
              </TouchableOpacity>
            </View>

            {expandedSections.before && (
              <View style={styles.stageCard}>
                <Text style={styles.algorithmTitle}>{t("plr.algorithmTitle")}</Text>
                <View style={styles.instructionsList}>
                  {Array.isArray(t("plr.beforePLRInstructions", { returnObjects: true })) &&
                    (t("plr.beforePLRInstructions", { returnObjects: true }) as string[]).map((instruction, i) => (
                      <View key={i} style={styles.instructionItem}>
                        <Text style={styles.instructionBullet}>•</Text>
                        <Text style={styles.instructionText}>{instruction}</Text>
                      </View>
                    ))}
                </View>

                {parameters.beforePLR.map((measurement, index) => (
                  <View key={index} style={styles.measurementRow}>
                    <Text style={styles.measurementLabel}>
                      {index + 1}. LVOT VTI
                    </Text>
                    <View style={styles.measurementInputContainer}>
                      <TextInput
                        style={styles.measurementInput}
                        value={measurement.value}
                        onChangeText={(text) => updateMeasurement("before", index, text)}
                        keyboardType="numeric"
                        placeholder="0.0"
                        placeholderTextColor={CyberpunkTheme.colors.textMuted}
                      />
                      <Text style={styles.measurementUnit}>cm</Text>
                      {index >= 5 && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => removeMeasurement("before", index)}
                        >
                          <Trash2 color={CyberpunkTheme.colors.error} size={16} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}



                {averageBeforePLR !== undefined && (
                  <View style={styles.averageBox}>
                    <Text style={styles.averageLabel}>{t("plr.averageBefore")}:</Text>
                    <Text style={styles.averageValue}>{averageBeforePLR.toFixed(2)} cm</Text>
                  </View>
                )}

                {currentStage === "before" && (
                  <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                    <Text style={styles.continueButtonText}>{t("plr.continueStudy")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(currentStage === "after" || currentStage === "completed") && (
              <>
                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    style={[
                      styles.collapsibleHeader,
                      averageAfterPLR !== undefined && styles.collapsibleHeaderCompleted,
                    ]}
                    onPress={() => setExpandedSections(prev => ({ ...prev, after: !prev.after }))}
                  >
                    <Text style={[
                      styles.sectionTitle,
                      averageAfterPLR !== undefined && styles.sectionTitleCompleted,
                    ]}>
                      2. {t("plr.afterPLRTitle")}
                    </Text>
                    {expandedSections.after ? (
                      <ChevronUp color={CyberpunkTheme.colors.neonCyan} size={24} />
                    ) : (
                      <ChevronDown color={CyberpunkTheme.colors.neonCyan} size={24} />
                    )}
                  </TouchableOpacity>
                </View>

                {expandedSections.after && (
                  <View style={styles.stageCard}>
                    <Text style={styles.algorithmTitle}>{t("plr.algorithmTitle")}</Text>
                    <View style={styles.instructionsList}>
                      {Array.isArray(t("plr.afterPLRInstructions", { returnObjects: true })) &&
                        (t("plr.afterPLRInstructions", { returnObjects: true }) as string[]).map((instruction, i) => (
                          <View key={i} style={styles.instructionItem}>
                            <Text style={styles.instructionBullet}>•</Text>
                            <Text style={styles.instructionText}>{instruction}</Text>
                          </View>
                        ))}
                    </View>

                    {parameters.afterPLR.map((measurement, index) => (
                      <View key={index} style={styles.measurementRow}>
                        <Text style={styles.measurementLabel}>
                          {index + 1}. LVOT VTI
                        </Text>
                        <View style={styles.measurementInputContainer}>
                          <TextInput
                            style={styles.measurementInput}
                            value={measurement.value}
                            onChangeText={(text) => updateMeasurement("after", index, text)}
                            keyboardType="numeric"
                            placeholder="0.0"
                            placeholderTextColor={CyberpunkTheme.colors.textMuted}
                          />
                          <Text style={styles.measurementUnit}>cm</Text>
                          {index >= 5 && (
                            <TouchableOpacity
                              style={styles.removeButton}
                              onPress={() => removeMeasurement("after", index)}
                            >
                              <Trash2 color={CyberpunkTheme.colors.error} size={16} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}



                    {averageAfterPLR !== undefined && (
                      <View style={styles.averageBox}>
                        <Text style={styles.averageLabel}>{t("plr.averageAfter")}:</Text>
                        <Text style={styles.averageValue}>{averageAfterPLR.toFixed(2)} cm</Text>
                      </View>
                    )}

                    {currentStage !== "completed" && (
                      <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
                        <Text style={styles.finishButtonText}>{t("plr.finishStudy")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {currentStage === "completed" && (
                  <View style={styles.conclusionCard}>
                  <Text style={styles.conclusionTitle}>{t("plr.conclusionTitle")}</Text>

                  {variability !== undefined && (
                    <View style={styles.variabilityBox}>
                      <Text style={styles.variabilityLabel}>{t("plr.variability")}: {variability.toFixed(1)}%</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.conclusionBadge,
                      conclusion === "responder"
                        ? styles.conclusionBadgeResponder
                        : conclusion === "not-assessed"
                        ? styles.conclusionBadgeNotAssessed
                        : styles.conclusionBadgeNonResponder,
                    ]}
                  >
                    <Text
                      style={[
                        styles.conclusionText,
                        conclusion === "responder"
                          ? styles.conclusionTextResponder
                          : conclusion === "not-assessed"
                          ? styles.conclusionTextNotAssessed
                          : styles.conclusionTextNonResponder,
                      ]}
                    >
                      {conclusion === "responder"
                        ? t("plr.responder")
                        : conclusion === "not-assessed"
                        ? t("plr.notAssessed")
                        : t("plr.nonResponder")}
                    </Text>
                  </View>
                  </View>
                )}

                {currentStage === "completed" && hasValidMeasurement && (
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                      <Check color={CyberpunkTheme.colors.background} size={20} />
                      <Text style={styles.buttonText}>{t("common.save")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                      <Text style={styles.copyButtonText}>{t("common.copy")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
    padding: CyberpunkTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CyberpunkTheme.colors.cardBorder,
  },
  backIconButton: {
    padding: CyberpunkTheme.spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
    marginLeft: CyberpunkTheme.spacing.md,
  },
  content: {
    flex: 1,
    padding: CyberpunkTheme.spacing.md,
  },
  patientInfo: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    padding: CyberpunkTheme.spacing.md,
    borderRadius: CyberpunkTheme.borderRadius.md,
    marginBottom: CyberpunkTheme.spacing.md,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonPurple,
    ...CyberpunkTheme.shadows.neonPurple,
  },
  patientInfoText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    textAlign: "center",
  },
  conditionsCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.lg,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  conditionsTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonPink,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  importantNoteBox: {
    flexDirection: "row",
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}15`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    gap: CyberpunkTheme.spacing.sm,
  },
  importantNoteText: {
    flex: 1,
    fontSize: 13,
    color: CyberpunkTheme.colors.text,
    lineHeight: 18,
  },
  conditionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: CyberpunkTheme.spacing.sm,
  },
  conditionText: {
    flex: 1,
    fontSize: 14,
    color: CyberpunkTheme.colors.text,
    marginRight: CyberpunkTheme.spacing.md,
  },
  warningBox: {
    backgroundColor: `${CyberpunkTheme.colors.error}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.error,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.md,
    marginTop: CyberpunkTheme.spacing.md,
  },
  warningText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.error,
    fontWeight: "600" as const,
  },
  sectionHeader: {
    marginBottom: CyberpunkTheme.spacing.md,
  },
  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  collapsibleHeaderCompleted: {
    borderColor: CyberpunkTheme.colors.neonCyan,
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}30`,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.neonCyan,
    flex: 1,
  },
  sectionTitleCompleted: {
    color: CyberpunkTheme.colors.neonCyan,
    fontWeight: "700" as const,
  },
  stageCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  algorithmTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.sm,
  },
  instructionsList: {
    marginBottom: CyberpunkTheme.spacing.md,
  },
  instructionItem: {
    flexDirection: "row",
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  instructionBullet: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textMuted,
    marginRight: CyberpunkTheme.spacing.xs,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: CyberpunkTheme.colors.textMuted,
    lineHeight: 18,
  },
  measurementRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: CyberpunkTheme.spacing.sm,
    gap: CyberpunkTheme.spacing.sm,
  },
  measurementLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    width: 100,
  },
  measurementInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: CyberpunkTheme.spacing.xs,
  },
  measurementInput: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.sm,
    color: CyberpunkTheme.colors.text,
    fontSize: 16,
  },
  measurementUnit: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textMuted,
  },
  removeButton: {
    padding: CyberpunkTheme.spacing.xs,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.sm,
    marginTop: CyberpunkTheme.spacing.sm,
    gap: CyberpunkTheme.spacing.xs,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  averageBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}15`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.md,
    marginTop: CyberpunkTheme.spacing.md,
  },
  averageLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  averageValue: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  continueButton: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    marginTop: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  finishButton: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    marginTop: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  finishButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  conclusionCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 2,
    borderColor: CyberpunkTheme.colors.neonPurple,
    borderRadius: CyberpunkTheme.borderRadius.lg,
    padding: CyberpunkTheme.spacing.lg,
    marginTop: CyberpunkTheme.spacing.lg,
    marginBottom: CyberpunkTheme.spacing.lg,
    alignItems: "center",
    ...CyberpunkTheme.shadows.neonPurple,
  },
  conclusionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonPurple,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  variabilityBox: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.sm,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  variabilityLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  variabilityValue: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  conclusionBadge: {
    paddingVertical: CyberpunkTheme.spacing.md,
    paddingHorizontal: CyberpunkTheme.spacing.lg,
    borderRadius: CyberpunkTheme.borderRadius.md,
  },
  conclusionBadgeResponder: {
    backgroundColor: CyberpunkTheme.colors.success,
  },
  conclusionBadgeNonResponder: {
    backgroundColor: CyberpunkTheme.colors.error,
  },
  conclusionBadgeNotAssessed: {
    backgroundColor: CyberpunkTheme.colors.cardBorder,
  },
  conclusionText: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  conclusionTextResponder: {
    color: CyberpunkTheme.colors.background,
  },
  conclusionTextNonResponder: {
    color: CyberpunkTheme.colors.background,
  },
  conclusionTextNotAssessed: {
    color: CyberpunkTheme.colors.textSecondary,
  },
  buttonContainer: {
    gap: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.xl,
  },
  saveButton: {
    backgroundColor: CyberpunkTheme.colors.neonPink,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: CyberpunkTheme.spacing.sm,
    ...CyberpunkTheme.shadows.neonPink,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  copyButton: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonPurple,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.neonPurple,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.neonPurple,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: CyberpunkTheme.spacing.xl,
  },
  notFoundText: {
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
