import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
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
import { pluralizeYears } from "@/utils/pluralizeYears";
import * as Clipboard from "expo-clipboard";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { showAlert } from "@/utils/alert";
import {
  PARAMETER_THRESHOLDS,
  PARAMETER_UNITS,
  PARAMETER_UNITS_DISPLAY,
  PreConditions,
  StudyParameters,
} from "@/types/medical";
import {
  calculateFinalConclusion,
  calculateVariability,
  determineResponderStatus,
  generateProtocol,
} from "@/utils/calculations";

export default function StudyScreen() {
  const { t, i18n } = useTranslation();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const insets = useSafeAreaInsets();
  const { getPatientById, addStudy } = usePatients();
  const patient = getPatientById(patientId!);

  const [preConditions, setPreConditions] = useState<PreConditions>({
    sinusRhythm: false,
    ventilationOrBreathHold: false,
  });

  const [parameters, setParameters] = useState<StudyParameters>({
    carotidArtery: { max: "", min: "" },
    brachialArtery: { max: "", min: "" },
    femoralArtery: { max: "", min: "" },
    lvotVTI: { max: "", min: "" },
  });

  useEffect(() => {
    console.log("Responder study screen mounted for patient:", patientId);
    if (patient) {
      setPreConditions({
        sinusRhythm: false,
        ventilationOrBreathHold: false,
      });
      setParameters({
        carotidArtery: { max: "", min: "" },
        brachialArtery: { max: "", min: "" },
        femoralArtery: { max: "", min: "" },
        lvotVTI: { max: "", min: "" },
      });
    }
  }, [patient, patientId]);

  const conditionsValid = preConditions.sinusRhythm && preConditions.ventilationOrBreathHold;

  useEffect(() => {
    const updatedParameters = { ...parameters };
    let hasChanges = false;

    (Object.keys(parameters) as (keyof StudyParameters)[]).forEach((key) => {
      const param = parameters[key];
      if (param.max && param.min) {
        const minVal = parseFloat(param.min.replace(',', '.'));
        const maxVal = parseFloat(param.max.replace(',', '.'));

        if (!isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
          if (param.variability !== undefined || param.result !== undefined) {
            updatedParameters[key] = { ...param, variability: undefined, result: undefined };
            hasChanges = true;
          }
          return;
        }

        const variability = calculateVariability(param.max, param.min);
        const normalizedVariability = variability !== null ? variability : undefined;
        const threshold: number = PARAMETER_THRESHOLDS[key];
        const result = determineResponderStatus(variability, threshold);

        if (param.variability !== normalizedVariability || param.result !== result) {
          updatedParameters[key] = { ...param, variability: normalizedVariability, result };
          hasChanges = true;
        }
      } else if (param.variability !== undefined || param.result !== undefined) {
        updatedParameters[key] = { ...param, variability: undefined, result: undefined };
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setParameters(updatedParameters);
    }
  }, [parameters]);

  const conclusion = useMemo(() => calculateFinalConclusion(parameters), [parameters]);

  const hasValidMeasurement = useMemo(() => {
    const parameterKeys = Object.keys(parameters) as (keyof StudyParameters)[];
    return parameterKeys.some((key) => {
      const param = parameters[key];
      if (!param.max || !param.min) return false;
      const minValue = parseFloat(param.min.replace(',', '.'));
      const maxValue = parseFloat(param.max.replace(',', '.'));
      return !isNaN(minValue) && !isNaN(maxValue) && minValue <= maxValue;
    });
  }, [parameters]);

  const updateParameter = (
    key: keyof StudyParameters,
    field: "max" | "min",
    value: string
  ) => {
    setParameters((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!patient) return;

    if (!conditionsValid) {
      showAlert(
        t("common.error"),
        t("study.conditionsNotMetError")
      );
      return;
    }

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateProtocol(
      patient.patientId,
      patient.gender,
      parameters,
      conclusion,
      currentDate,
      t,
      i18n.language,
      { age: patient.age, height: patient.height, weight: patient.weight }
    );

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "responder" as const,
      parameters,
      preConditions,
      conclusion,
      protocol,
    };

    await addStudy(patient.id, newStudy);

    showAlert(
      t("study.successTitle"),
      t("study.studySaved"),
      [
        {
          text: t("common.ok"),
          onPress: () => {
            router.replace(`/(tabs)/patient/${patient.id}`);
          },
        },
      ]
    );
  };

  const handleCopy = async () => {
    if (!patient || !conditionsValid) return;

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateProtocol(
      patient.patientId,
      patient.gender,
      parameters,
      conclusion,
      currentDate,
      t,
      i18n.language,
      { age: patient.age, height: patient.height, weight: patient.weight }
    );

    await Clipboard.setStringAsync(protocol);

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "responder" as const,
      parameters,
      preConditions,
      conclusion,
      protocol,
    };

    await addStudy(patient.id, newStudy);
    
    showAlert(t("study.successTitle"), t("study.protocolCopied"));
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

  const normalizeDecimalInput = (value: string): string => {
    return value.replace(',', '.');
  };

  const formatThreshold = (value: number): string => {
    return i18n.language === "ru" ? value.toString().replace('.', ',') : value.toString();
  };

  const renderParameter = (
    key: keyof StudyParameters,
    name: string,
    units: { max: string; min: string }
  ) => {
    const param = parameters[key];
    const hasValues = param.max && param.min;
    const threshold: number = PARAMETER_THRESHOLDS[key];

    const minValue = parseFloat(normalizeDecimalInput(param.min));
    const maxValue = parseFloat(normalizeDecimalInput(param.max));
    const hasError = hasValues && !isNaN(minValue) && !isNaN(maxValue) && minValue > maxValue;

    return (
      <View key={key} style={styles.parameterCard}>
        <Text style={styles.parameterTitle}>{name}</Text>

        <View style={styles.inputRow}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{units.min} ({PARAMETER_UNITS_DISPLAY[key]})</Text>
            <TextInput
              style={styles.input}
              value={param.min}
              onChangeText={(text) => updateParameter(key, "min", text)}
              keyboardType="numeric"
              placeholder="0.0"
              placeholderTextColor={CyberpunkTheme.colors.textMuted}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{units.max} ({PARAMETER_UNITS_DISPLAY[key]})</Text>
            <TextInput
              style={styles.input}
              value={param.max}
              onChangeText={(text) => updateParameter(key, "max", text)}
              keyboardType="numeric"
              placeholder="0.0"
              placeholderTextColor={CyberpunkTheme.colors.textMuted}
            />
          </View>
        </View>


        {hasError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {t("study.errorMinMax")}
            </Text>
          </View>
        )}

        {hasValues && !hasError && (param.variability !== null && param.variability !== undefined) && (
          <View style={styles.resultContainer}>
            <Text style={styles.variabilityText}>
              {t("study.variability")}: {param.variability.toFixed(1)}%
            </Text>
            <Text style={styles.thresholdText}>{t("study.threshold")}: ≥{formatThreshold(threshold)}%</Text>
            <View
              style={[
                styles.resultBadge,
                param.result === "responder" ? styles.resultBadgeResponder : styles.resultBadgeNonResponder,
              ]}
            >
              <Text
                style={[
                  styles.resultText,
                  param.result === "responder" ? styles.resultTextResponder : styles.resultTextNonResponder,
                ]}
              >
                {param.result === "responder" ? t("study.responder") : t("study.nonResponder")}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

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
        <Text style={styles.headerTitle}>{t("study.title")}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientInfoText}>
            ID: {patient.patientId} | {patient.gender === "male" ? t("common.male").charAt(0) : t("common.female").charAt(0)}
            {patient.age !== undefined ? ` | ${patient.age} ${pluralizeYears(patient.age!, i18n.language)}` : ""}
          </Text>
        </View>

        <View style={styles.conditionsCard}>
          <Text style={styles.conditionsTitle}>{t("study.conditionsTitle")}</Text>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("study.sinusRhythm")}</Text>
            <Switch
              value={preConditions.sinusRhythm}
              onValueChange={(value) =>
                setPreConditions((prev) => ({ ...prev, sinusRhythm: value }))
              }
              trackColor={{
                false: CyberpunkTheme.colors.cardBorder,
                true: CyberpunkTheme.colors.neonCyan,
              }}
              thumbColor={
                preConditions.sinusRhythm
                  ? CyberpunkTheme.colors.text
                  : "#FFFFFF"
              }
            />
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>
              {t("study.ventilation")}
            </Text>
            <Switch
              value={preConditions.ventilationOrBreathHold}
              onValueChange={(value) =>
                setPreConditions((prev) => ({ ...prev, ventilationOrBreathHold: value }))
              }
              trackColor={{
                false: CyberpunkTheme.colors.cardBorder,
                true: CyberpunkTheme.colors.neonCyan,
              }}
              thumbColor={
                preConditions.ventilationOrBreathHold
                  ? CyberpunkTheme.colors.text
                  : "#FFFFFF"
              }
            />
          </View>

          {!conditionsValid && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                {t("study.conditionsNotMet")}
              </Text>
            </View>
          )}
        </View>

        {conditionsValid && (
          <>
            <Text style={styles.sectionTitle}>{t("study.parametersTitle")}</Text>

            {renderParameter(
              "lvotVTI",
              t("parameters.lvotVTI"),
              PARAMETER_UNITS.lvotVTI
            )}

            {renderParameter(
              "femoralArtery",
              t("parameters.femoralArtery"),
              PARAMETER_UNITS.femoralArtery
            )}

            {renderParameter(
              "carotidArtery",
              t("parameters.carotidArtery"),
              PARAMETER_UNITS.carotidArtery
            )}

            {renderParameter(
              "brachialArtery",
              t("parameters.brachialArtery"),
              PARAMETER_UNITS.brachialArtery
            )}

            <View style={styles.conclusionCard}>
              <Text style={styles.conclusionTitle}>{t("study.conclusionTitle")}</Text>
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
                    ? t("study.responder")
                    : conclusion === "not-assessed"
                    ? t("study.notAssessed")
                    : t("study.nonResponder")}
                </Text>
              </View>
            </View>

            {hasValidMeasurement && (
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
    fontSize: 20,
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
    borderColor: CyberpunkTheme.colors.neonCyan,
    ...CyberpunkTheme.shadows.neonCyan,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  parameterCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  parameterTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  inputRow: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.md,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: CyberpunkTheme.colors.textMuted,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  input: {
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.sm,
    color: CyberpunkTheme.colors.text,
    fontSize: 16,
  },
  resultContainer: {
    marginTop: CyberpunkTheme.spacing.md,
    paddingTop: CyberpunkTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: CyberpunkTheme.colors.cardBorder,
  },
  variabilityText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  thresholdText: {
    fontSize: 12,
    color: CyberpunkTheme.colors.textMuted,
    marginTop: CyberpunkTheme.spacing.xs,
  },
  resultBadge: {
    alignSelf: "flex-start",
    paddingVertical: CyberpunkTheme.spacing.xs,
    paddingHorizontal: CyberpunkTheme.spacing.sm,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    marginTop: CyberpunkTheme.spacing.sm,
  },
  resultBadgeResponder: {
    backgroundColor: `${CyberpunkTheme.colors.success}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.success,
  },
  resultBadgeNonResponder: {
    backgroundColor: `${CyberpunkTheme.colors.error}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.error,
  },
  resultText: {
    fontSize: 12,
    fontWeight: "700" as const,
  },
  resultTextResponder: {
    color: CyberpunkTheme.colors.success,
  },
  resultTextNonResponder: {
    color: CyberpunkTheme.colors.error,
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
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.neonCyan,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.neonCyan,
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
  errorContainer: {
    marginTop: CyberpunkTheme.spacing.md,
    paddingTop: CyberpunkTheme.spacing.md,
    paddingHorizontal: CyberpunkTheme.spacing.sm,
    paddingBottom: CyberpunkTheme.spacing.sm,
    backgroundColor: `${CyberpunkTheme.colors.error}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.error,
    borderRadius: CyberpunkTheme.borderRadius.sm,
  },
  errorText: {
    fontSize: 13,
    color: CyberpunkTheme.colors.error,
    fontWeight: "600" as const,
  },
});
