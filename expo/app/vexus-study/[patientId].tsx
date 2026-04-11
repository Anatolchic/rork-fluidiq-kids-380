import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check } from "lucide-react-native";
import { useState, useEffect, useMemo } from "react";
import {
  Image,
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
import { getScoreText as getScoreTextUtil } from "@/utils/scoreText";
import {
  VExUSParameters,
  VExUSPreConditions,
  DopplerPattern,
  VExUSGrade,
} from "@/types/medical";

const HEPATIC_VEIN_IMAGES = {
  normal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t3m2gcswbyykjmweidukw.jpg",
  mildlyAbnormal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/00pvh36ldx9xck45khfts.jpg",
  severelyAbnormal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/khe4wjsdvpf3av5srexwz.jpg",
};

const RENAL_VEIN_IMAGES = {
  normal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/98kohrqig1a3vp1a6sfmm.jpg",
  mildlyAbnormal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/7sa2duos9j0hpynf8pjgt.jpg",
  severelyAbnormal: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/8fkmfazws8dhm6o4bqh2y.jpg",
};

function getDopplerScore(pattern: DopplerPattern | undefined): number {
  if (!pattern || pattern === "not-assessed") return 0;
  if (pattern === "normal") return 0;
  if (pattern === "mildly-abnormal") return 1;
  if (pattern === "severely-abnormal") return 2;
  return 0;
}

function getGradeFromTotalScore(totalScore: number): VExUSGrade {
  if (totalScore <= 1) return "grade-0";
  if (totalScore === 2) return "grade-1";
  if (totalScore <= 4) return "grade-2";
  return "grade-3";
}

export default function VExUSStudyScreen() {
  const { t, i18n } = useTranslation();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const insets = useSafeAreaInsets();
  const { getPatientById, addStudy } = usePatients();
  const patient = getPatientById(patientId!);

  const [preConditions, setPreConditions] = useState<VExUSPreConditions>({
    sinusRhythm: false,
    noCirrhosis: false,
    noIntraAbdominalHypertension: false,
  });

  const [parameters, setParameters] = useState<VExUSParameters>({
    dmaxIVC: "",
    ivcIndex: undefined,
    ivcScore: undefined,
    hepaticVeinDoppler: undefined,
    hepaticScore: undefined,
    portalVeinVmin: "",
    portalVeinVmax: "",
    portalVeinPI: undefined,
    portalVeinResult: undefined,
    portalScore: undefined,
    renalVeinDoppler: undefined,
    renalScore: undefined,
    totalScore: undefined,
  });

  const [dmaxError, setDmaxError] = useState<string>("");

  const [expandedSections, setExpandedSections] = useState<{
    hepatic: boolean;
    portal: boolean;
    renal: boolean;
  }>({
    hepatic: false,
    portal: false,
    renal: false,
  });

  useEffect(() => {
    console.log("VExUS study screen mounted for patient:", patientId);
    if (patient) {
      setPreConditions({
        sinusRhythm: false,
        noCirrhosis: false,
        noIntraAbdominalHypertension: false,
      });
      setParameters({
        dmaxIVC: "",
        ivcIndex: undefined,
        ivcScore: undefined,
        hepaticVeinDoppler: undefined,
        hepaticScore: undefined,
        portalVeinVmin: "",
        portalVeinVmax: "",
        portalVeinPI: undefined,
        portalVeinResult: undefined,
        portalScore: undefined,
        renalVeinDoppler: undefined,
        renalScore: undefined,
        totalScore: undefined,
      });
      setDmaxError("");
      setExpandedSections({ hepatic: false, portal: false, renal: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const conditionsValid = preConditions.sinusRhythm && preConditions.noCirrhosis && preConditions.noIntraAbdominalHypertension;

  const patientBsa = patient?.bsa ?? 0;

  const handleDmaxChange = (text: string) => {
    setDmaxError("");
    const val = parseFloat(text.replace(",", "."));
    let ivcIndex: number | undefined;
    let ivcScore: number | undefined;

    if (!isNaN(val) && val > 0 && patientBsa > 0) {
      if (val < 0.1 || val > 4) {
        setDmaxError(t("vexus.dmaxError"));
      }
      ivcIndex = Math.round((val / patientBsa) * 100) / 100;
      ivcScore = ivcIndex >= 1.96 ? 1 : 0;
    }

    setParameters((prev) => ({
      ...prev,
      dmaxIVC: text,
      ivcIndex,
      ivcScore,
    }));
  };

  const ivcStudyComplete = parameters.ivcScore === 0;

  const calculatePortalVeinPI = (vmin: string, vmax: string): number | undefined => {
    const minValue = parseFloat(vmin.replace(",", "."));
    const maxValue = parseFloat(vmax.replace(",", "."));
    if (isNaN(minValue) || isNaN(maxValue) || maxValue === 0 || minValue >= maxValue) return undefined;
    return ((maxValue - minValue) / maxValue) * 100;
  };

  const getPortalVeinResult = (pi: number | undefined): DopplerPattern => {
    if (pi === undefined) return "not-assessed";
    if (pi < 30) return "normal";
    if (pi < 50) return "mildly-abnormal";
    return "severely-abnormal";
  };

  const totalScore = useMemo(() => {
    if (parameters.ivcScore === undefined) return undefined;
    if (parameters.ivcScore === 0) return 0;

    const hepaticScore = getDopplerScore(parameters.hepaticVeinDoppler);
    const portalScore = getDopplerScore(parameters.portalVeinResult);
    const renalScore = getDopplerScore(parameters.renalVeinDoppler);

    const hepaticDone = parameters.hepaticVeinDoppler && parameters.hepaticVeinDoppler !== "not-assessed";
    const portalDone = parameters.portalVeinResult && parameters.portalVeinResult !== "not-assessed";
    const renalDone = parameters.renalVeinDoppler && parameters.renalVeinDoppler !== "not-assessed";

    if (!hepaticDone || !portalDone || !renalDone) return undefined;

    return parameters.ivcScore + hepaticScore + portalScore + renalScore;
  }, [parameters.ivcScore, parameters.hepaticVeinDoppler, parameters.portalVeinResult, parameters.renalVeinDoppler]);

  const conclusion = useMemo((): VExUSGrade => {
    if (parameters.ivcScore === undefined) return "not-assessed";
    if (parameters.ivcScore === 0) return "grade-0";
    if (totalScore === undefined) return "not-assessed";
    return getGradeFromTotalScore(totalScore);
  }, [parameters.ivcScore, totalScore]);

  const hepaticScore = getDopplerScore(parameters.hepaticVeinDoppler);
  const portalScore = getDopplerScore(parameters.portalVeinResult);
  const renalScore = getDopplerScore(parameters.renalVeinDoppler);

  const getDopplerResultText = (result: DopplerPattern | undefined): string => {
    if (!result || result === "not-assessed") return "—";
    switch (result) {
      case "normal": return t("vexus.normal");
      case "mildly-abnormal": return t("vexus.mildlyAbnormal");
      case "severely-abnormal": return t("vexus.severelyAbnormal");
      default: return "—";
    }
  };

  const getScoreText = (score: number): string => getScoreTextUtil(score, t);

  const generateVExUSProtocol = (): string => {
    const date = new Date();
    const locale = i18n.language === "ru" ? "ru-RU" : "en-US";
    const dateStr = date.toLocaleDateString(locale);
    const timeStr = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

    let protocol = `p-VExUS\n\n`;
    protocol += `${t("study.title")}: ${dateStr} ${timeStr}\n`;
    protocol += `${t("patient.patientId")}: ${patient!.patientId}\n`;
    protocol += `${t("patient.gender")}: ${patient!.gender === "male" ? t("common.male") : t("common.female")}\n`;
    if (patient!.age !== undefined) protocol += `${t("patient.age")}: ${patient!.age} ${pluralizeYears(patient!.age!, i18n.language)}\n`;
    if (patient!.height !== undefined) protocol += `${t("patient.height")}: ${patient!.height} ${t("patient.cm")}\n`;
    if (patient!.weight !== undefined) protocol += `${t("patient.weight")}: ${patient!.weight} ${t("patient.kg")}\n`;
    protocol += `\n`;

    if (parameters.dmaxIVC) {
      protocol += `1. ${t("vexus.dmaxIVCProtocol")}:\n`;
      protocol += `  Dmax: ${parameters.dmaxIVC} ${t("patient.cm")}\n`;
      if (parameters.ivcIndex !== undefined) {
        protocol += `  ${t("vexus.ivcIndex")}: ${parameters.ivcIndex.toFixed(2)} ${t("vexus.ivcIndexUnit")}\n`;
      }
      protocol += `  ${getScoreText(parameters.ivcScore ?? 0)}\n`;
    }

    if (parameters.ivcScore === 1) {
      protocol += `\n2. ${t("vexus.hepaticVeinTitle")}:\n`;
      protocol += `  ${getDopplerResultText(parameters.hepaticVeinDoppler)}\n`;
      protocol += `  ${getScoreText(hepaticScore)}\n`;

      protocol += `\n3. ${t("vexus.portalVeinTitle")}:\n`;
      if (parameters.portalVeinPI !== undefined) {
        protocol += `  PI: ${parameters.portalVeinPI.toFixed(1)}%\n`;
      }
      protocol += `  ${getDopplerResultText(parameters.portalVeinResult)}\n`;
      protocol += `  ${getScoreText(portalScore)}\n`;

      protocol += `\n4. ${t("vexus.renalVeinTitle")}:\n`;
      protocol += `  ${getDopplerResultText(parameters.renalVeinDoppler)}\n`;
      protocol += `  ${getScoreText(renalScore)}\n`;
    }

    protocol += `\n${t("vexus.conclusionTitle")}:\n`;
    if (conclusion === "grade-0") {
      protocol += `${t("vexus.grade0")}\n`;
      protocol += `${t("vexus.totalPoints")}: ${totalScore ?? 0}\n`;
      protocol += `${t("vexus.grade0Description")}\n`;
    } else if (conclusion === "grade-1") {
      protocol += `${t("vexus.grade1")}\n`;
      protocol += `${t("vexus.totalPoints")}: ${totalScore}\n`;
      protocol += `${t("vexus.grade1Description")}\n`;
    } else if (conclusion === "grade-2") {
      protocol += `${t("vexus.grade2")}\n`;
      protocol += `${t("vexus.totalPoints")}: ${totalScore}\n`;
      protocol += `${t("vexus.grade2Description")}\n`;
    } else if (conclusion === "grade-3") {
      protocol += `${t("vexus.grade3")}\n`;
      protocol += `${t("vexus.totalPoints")}: ${totalScore}\n`;
      protocol += `${t("vexus.grade3Description")}\n`;
    } else {
      protocol += `${t("vexus.notAssessed")}\n`;
    }

    return protocol;
  };

  const handleSave = async () => {
    if (!patient) return;
    if (!conditionsValid) {
      showAlert(t("common.error"), t("vexus.conditionsNotMet"));
      return;
    }

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateVExUSProtocol();

    const finalParams: VExUSParameters = {
      ...parameters,
      hepaticScore,
      portalScore,
      renalScore,
      totalScore: totalScore ?? 0,
    };

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "vexus" as const,
      vexusParameters: finalParams,
      vexusPreConditions: preConditions,
      conclusion,
      totalScore: totalScore ?? 0,
      protocol,
    };

    await addStudy(patient.id, newStudy);
    showAlert(t("study.successTitle"), t("vexus.studySaved"), [
      { text: t("common.ok"), onPress: () => router.replace(`/(tabs)/patient/${patient.id}`) },
    ]);
  };

  const handleCopy = async () => {
    if (!patient || !conditionsValid) return;

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateVExUSProtocol();
    await Clipboard.setStringAsync(protocol);

    const finalParams: VExUSParameters = {
      ...parameters,
      hepaticScore,
      portalScore,
      renalScore,
      totalScore: totalScore ?? 0,
    };

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "vexus" as const,
      vexusParameters: finalParams,
      vexusPreConditions: preConditions,
      conclusion,
      totalScore: totalScore ?? 0,
      protocol,
    };

    await addStudy(patient.id, newStudy);
    showAlert(t("study.successTitle"), t("vexus.protocolCopied"));
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

  const renderScoreBadge = (score: number) => (
    <View style={styles.scoreBadgeContainer}>
      <View style={[
        styles.scoreBadge,
        score === 0 && styles.scoreBadgeGreen,
        score === 1 && styles.scoreBadgeOrange,
        score >= 2 && styles.scoreBadgeRed,
      ]}>
        <Text style={styles.scoreBadgeText}>{getScoreText(score)}</Text>
      </View>
    </View>
  );

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
        <Text style={styles.headerTitle}>{t("vexus.title")}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientInfoText}>
            ID: {patient.patientId} | {patient.gender === "male" ? t("common.male").charAt(0) : t("common.female").charAt(0)}
            {patient.age !== undefined ? ` | ${patient.age} ${pluralizeYears(patient.age!, i18n.language)}` : ""}
          </Text>
        </View>

        <View style={styles.conditionsCard}>
          <Text style={styles.conditionsTitle}>{t("vexus.conditionsTitle")}</Text>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("vexus.sinusRhythm")}</Text>
            <Switch
              value={preConditions.sinusRhythm}
              onValueChange={(value) => setPreConditions((prev) => ({ ...prev, sinusRhythm: value }))}
              trackColor={{ false: CyberpunkTheme.colors.cardBorder, true: CyberpunkTheme.colors.neonCyan }}
              thumbColor={preConditions.sinusRhythm ? CyberpunkTheme.colors.text : "#FFFFFF"}
            />
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("vexus.noCirrhosis")}</Text>
            <Switch
              value={preConditions.noCirrhosis}
              onValueChange={(value) => setPreConditions((prev) => ({ ...prev, noCirrhosis: value }))}
              trackColor={{ false: CyberpunkTheme.colors.cardBorder, true: CyberpunkTheme.colors.neonCyan }}
              thumbColor={preConditions.noCirrhosis ? CyberpunkTheme.colors.text : "#FFFFFF"}
            />
          </View>

          <View style={styles.conditionRow}>
            <Text style={styles.conditionText}>{t("vexus.noIntraAbdominalHypertension")}</Text>
            <Switch
              value={preConditions.noIntraAbdominalHypertension}
              onValueChange={(value) => setPreConditions((prev) => ({ ...prev, noIntraAbdominalHypertension: value }))}
              trackColor={{ false: CyberpunkTheme.colors.cardBorder, true: CyberpunkTheme.colors.neonCyan }}
              thumbColor={preConditions.noIntraAbdominalHypertension ? CyberpunkTheme.colors.text : "#FFFFFF"}
            />
          </View>

          {!conditionsValid && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>{t("vexus.conditionsNotMet")}</Text>
            </View>
          )}
        </View>

        {conditionsValid && (
          <>
            <View style={styles.parameterCard}>
              <Text style={styles.parameterTitle}>{t("vexus.dmaxIVC")}</Text>
              <TextInput
                style={[styles.input, dmaxError ? styles.inputErrorStyle : null]}
                value={parameters.dmaxIVC}
                onChangeText={handleDmaxChange}
                keyboardType="numeric"
                placeholder={t("vexus.dmaxPlaceholder")}
                placeholderTextColor={CyberpunkTheme.colors.textMuted}
              />
              {dmaxError ? <Text style={styles.errorText}>{dmaxError}</Text> : null}

              {parameters.ivcIndex !== undefined && (
                <View style={styles.resultContainer}>
                  <Text style={styles.variabilityText}>
                    {t("vexus.ivcIndex")}: {parameters.ivcIndex.toFixed(2)} {t("vexus.ivcIndexUnit")}
                  </Text>
                  {parameters.ivcScore !== undefined && renderScoreBadge(parameters.ivcScore)}
                </View>
              )}

              {ivcStudyComplete && (
                <View style={styles.studyCompleteBox}>
                  <Text style={styles.studyCompleteTitle}>{t("vexus.grade0")}</Text>
                  <Text style={styles.studyCompleteScore}>{getScoreText(0)}</Text>
                  <Text style={styles.studyCompleteDesc}>{t("vexus.noVenousCongestion")}</Text>
                </View>
              )}
            </View>

            {parameters.ivcScore === 1 && (
              <>
                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    style={[
                      styles.collapsibleHeader,
                      parameters.hepaticVeinDoppler && parameters.hepaticVeinDoppler !== "not-assessed" && styles.collapsibleHeaderCompleted,
                    ]}
                    onPress={() => setExpandedSections((prev) => ({ ...prev, hepatic: !prev.hepatic }))}
                  >
                    <Text style={[
                      styles.sectionTitle,
                      parameters.hepaticVeinDoppler && parameters.hepaticVeinDoppler !== "not-assessed" && styles.sectionTitleCompleted,
                    ]}>{t("vexus.hepaticVeinTitle")}</Text>

                    <Text style={[
                      styles.expandIcon,
                      parameters.hepaticVeinDoppler && parameters.hepaticVeinDoppler !== "not-assessed" && styles.expandIconCompleted,
                    ]}>{expandedSections.hepatic ? "−" : "+"}</Text>
                  </TouchableOpacity>
                </View>

                {expandedSections.hepatic && (
                  <View style={styles.parameterCard}>
                    <Text style={styles.questionText}>{t("vexus.hepaticVeinQuestion")}</Text>
                    <View style={styles.imageGrid}>
                      {(["normal", "mildlyAbnormal", "severelyAbnormal"] as const).map((pattern) => (
                        <TouchableOpacity
                          key={pattern}
                          style={[
                            styles.imageOption,
                            parameters.hepaticVeinDoppler === pattern.replace(/([A-Z])/g, "-$1").toLowerCase() && styles.imageOptionSelected,
                          ]}
                          onPress={() => setParameters((prev) => ({
                            ...prev,
                            hepaticVeinDoppler: pattern.replace(/([A-Z])/g, "-$1").toLowerCase() as DopplerPattern,
                            hepaticScore: getDopplerScore(pattern.replace(/([A-Z])/g, "-$1").toLowerCase() as DopplerPattern),
                          }))}
                        >
                          <Image source={{ uri: HEPATIC_VEIN_IMAGES[pattern] }} style={styles.fullWidthImage} resizeMode="contain" />
                          <Text style={styles.imageLabelCenter}>{t(`vexus.${pattern}`)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {parameters.hepaticVeinDoppler && parameters.hepaticVeinDoppler !== "not-assessed" && (
                      <View style={styles.resultContainer}>
                        <Text style={styles.variabilityText}>{getDopplerResultText(parameters.hepaticVeinDoppler)}</Text>
                        {renderScoreBadge(hepaticScore)}
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    style={[
                      styles.collapsibleHeader,
                      parameters.portalVeinPI !== undefined && parameters.portalVeinResult && parameters.portalVeinResult !== "not-assessed" && styles.collapsibleHeaderCompleted,
                    ]}
                    onPress={() => setExpandedSections((prev) => ({ ...prev, portal: !prev.portal }))}
                  >
                    <Text style={[
                      styles.sectionTitle,
                      parameters.portalVeinPI !== undefined && parameters.portalVeinResult && parameters.portalVeinResult !== "not-assessed" && styles.sectionTitleCompleted,
                    ]}>{t("vexus.portalVeinTitle")}</Text>

                    <Text style={[
                      styles.expandIcon,
                      parameters.portalVeinPI !== undefined && parameters.portalVeinResult && parameters.portalVeinResult !== "not-assessed" && styles.expandIconCompleted,
                    ]}>{expandedSections.portal ? "−" : "+"}</Text>
                  </TouchableOpacity>
                </View>

                {expandedSections.portal && (
                  <View style={styles.parameterCard}>
                    <Text style={styles.questionText}>{t("vexus.portalVeinDescription")}</Text>
                    <View style={styles.inputRow}>
                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("vexus.portalVeinVmin")}</Text>
                        <TextInput
                          style={[
                            styles.input,
                            parameters.portalVeinVmin && parameters.portalVeinVmax &&
                            parseFloat(parameters.portalVeinVmin.replace(",", ".")) >= parseFloat(parameters.portalVeinVmax.replace(",", ".")) &&
                            styles.inputErrorStyle,
                          ]}
                          value={parameters.portalVeinVmin || ""}
                          onChangeText={(text) => {
                            setParameters((prev) => {
                              const pi = calculatePortalVeinPI(text, prev.portalVeinVmax || "");
                              const result = getPortalVeinResult(pi);
                              return { ...prev, portalVeinVmin: text, portalVeinPI: pi, portalVeinResult: result, portalScore: getDopplerScore(result) };
                            });
                          }}
                          keyboardType="numeric"
                          placeholder="0.0"
                          placeholderTextColor={CyberpunkTheme.colors.textMuted}
                        />
                      </View>
                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>{t("vexus.portalVeinVmax")}</Text>
                        <TextInput
                          style={[
                            styles.input,
                            parameters.portalVeinVmin && parameters.portalVeinVmax &&
                            parseFloat(parameters.portalVeinVmin.replace(",", ".")) >= parseFloat(parameters.portalVeinVmax.replace(",", ".")) &&
                            styles.inputErrorStyle,
                          ]}
                          value={parameters.portalVeinVmax || ""}
                          onChangeText={(text) => {
                            setParameters((prev) => {
                              const pi = calculatePortalVeinPI(prev.portalVeinVmin || "", text);
                              const result = getPortalVeinResult(pi);
                              return { ...prev, portalVeinVmax: text, portalVeinPI: pi, portalVeinResult: result, portalScore: getDopplerScore(result) };
                            });
                          }}
                          keyboardType="numeric"
                          placeholder="0.0"
                          placeholderTextColor={CyberpunkTheme.colors.textMuted}
                        />
                      </View>
                    </View>

                    {parameters.portalVeinVmin && parameters.portalVeinVmax &&
                     parseFloat(parameters.portalVeinVmin.replace(",", ".")) >= parseFloat(parameters.portalVeinVmax.replace(",", ".")) && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorTextSmall}>{t("study.errorMinMax")}</Text>
                      </View>
                    )}

                    {parameters.portalVeinPI !== undefined && parameters.portalVeinResult && parameters.portalVeinResult !== "not-assessed" && (
                      <View style={styles.resultContainer}>
                        <Text style={styles.variabilityText}>
                          {t("vexus.portalVeinTitle")}: {parameters.portalVeinPI.toFixed(1)}%
                        </Text>
                        <Text style={styles.resultSubText}>{getDopplerResultText(parameters.portalVeinResult)}</Text>
                        {renderScoreBadge(portalScore)}
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.sectionHeader}>
                  <TouchableOpacity
                    style={[
                      styles.collapsibleHeader,
                      parameters.renalVeinDoppler && parameters.renalVeinDoppler !== "not-assessed" && styles.collapsibleHeaderCompleted,
                    ]}
                    onPress={() => setExpandedSections((prev) => ({ ...prev, renal: !prev.renal }))}
                  >
                    <Text style={[
                      styles.sectionTitle,
                      parameters.renalVeinDoppler && parameters.renalVeinDoppler !== "not-assessed" && styles.sectionTitleCompleted,
                    ]}>{t("vexus.renalVeinTitle")}</Text>

                    <Text style={[
                      styles.expandIcon,
                      parameters.renalVeinDoppler && parameters.renalVeinDoppler !== "not-assessed" && styles.expandIconCompleted,
                    ]}>{expandedSections.renal ? "−" : "+"}</Text>
                  </TouchableOpacity>
                </View>

                {expandedSections.renal && (
                  <View style={styles.parameterCard}>
                    <Text style={styles.questionText}>{t("vexus.renalVeinQuestion")}</Text>
                    <View style={styles.imageGrid}>
                      {(["normal", "mildlyAbnormal", "severelyAbnormal"] as const).map((pattern) => (
                        <TouchableOpacity
                          key={pattern}
                          style={[
                            styles.imageOption,
                            parameters.renalVeinDoppler === pattern.replace(/([A-Z])/g, "-$1").toLowerCase() && styles.imageOptionSelected,
                          ]}
                          onPress={() => setParameters((prev) => ({
                            ...prev,
                            renalVeinDoppler: pattern.replace(/([A-Z])/g, "-$1").toLowerCase() as DopplerPattern,
                            renalScore: getDopplerScore(pattern.replace(/([A-Z])/g, "-$1").toLowerCase() as DopplerPattern),
                          }))}
                        >
                          <Image source={{ uri: RENAL_VEIN_IMAGES[pattern] }} style={styles.fullWidthImage} resizeMode="contain" />
                          <Text style={styles.imageLabelCenter}>{t(`vexus.${pattern}`)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {parameters.renalVeinDoppler && parameters.renalVeinDoppler !== "not-assessed" && (
                      <View style={styles.resultContainer}>
                        <Text style={styles.variabilityText}>{getDopplerResultText(parameters.renalVeinDoppler)}</Text>
                        {renderScoreBadge(renalScore)}
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {!ivcStudyComplete && (
              <View style={styles.conclusionCard}>
                <Text style={styles.conclusionTitle}>{t("vexus.conclusionTitle")}</Text>
                <View style={[
                  styles.conclusionBadge,
                  conclusion === "grade-0" && styles.conclusionBadgeGrade0,
                  conclusion === "grade-1" && styles.conclusionBadgeGrade1,
                  conclusion === "grade-2" && styles.conclusionBadgeGrade2,
                  conclusion === "grade-3" && styles.conclusionBadgeGrade3,
                  conclusion === "not-assessed" && styles.conclusionBadgeNotAssessed,
                ]}>
                  {conclusion === "not-assessed" ? (
                    <Text style={styles.conclusionTextNotAssessed}>{t("vexus.notAssessed")}</Text>
                  ) : (
                    <>
                      <Text style={styles.conclusionGradeText}>
                        {conclusion === "grade-0" && t("vexus.grade0")}
                        {conclusion === "grade-1" && t("vexus.grade1")}
                        {conclusion === "grade-2" && t("vexus.grade2")}
                        {conclusion === "grade-3" && t("vexus.grade3")}
                      </Text>
                      {totalScore !== undefined && (
                        <Text style={styles.conclusionScoreText}>{t("vexus.totalPoints")}: {totalScore}</Text>
                      )}
                      <Text style={styles.conclusionDescriptionText}>
                        {conclusion === "grade-0" && t("vexus.grade0Description")}
                        {conclusion === "grade-1" && t("vexus.grade1Description")}
                        {conclusion === "grade-2" && t("vexus.grade2Description")}
                        {conclusion === "grade-3" && t("vexus.grade3Description")}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

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
    borderColor: CyberpunkTheme.colors.neonPurple,
    ...CyberpunkTheme.shadows.neonPurple,
  },
  patientInfoText: {
    fontSize: 14,
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
  questionText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textMuted,
    marginBottom: CyberpunkTheme.spacing.md,
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
  inputErrorStyle: {
    borderColor: CyberpunkTheme.colors.error,
    borderWidth: 2,
  },
  errorText: {
    fontSize: 13,
    color: CyberpunkTheme.colors.error,
    fontWeight: "600" as const,
    marginTop: CyberpunkTheme.spacing.xs,
  },
  errorTextSmall: {
    fontSize: 12,
    color: CyberpunkTheme.colors.error,
    fontWeight: "600" as const,
  },
  errorBox: {
    backgroundColor: `${CyberpunkTheme.colors.error}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.error,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.sm,
    marginTop: CyberpunkTheme.spacing.md,
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
  resultSubText: {
    fontSize: 13,
    color: CyberpunkTheme.colors.textSecondary,
    marginTop: CyberpunkTheme.spacing.xs,
  },
  scoreBadgeContainer: {
    marginTop: CyberpunkTheme.spacing.sm,
  },
  scoreBadge: {
    alignSelf: "flex-start" as const,
    paddingVertical: CyberpunkTheme.spacing.xs,
    paddingHorizontal: CyberpunkTheme.spacing.sm,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    borderWidth: 1,
  },
  scoreBadgeGreen: {
    backgroundColor: `${CyberpunkTheme.colors.success}20`,
    borderColor: CyberpunkTheme.colors.success,
  },
  scoreBadgeOrange: {
    backgroundColor: "rgba(255, 140, 0, 0.2)",
    borderColor: "#FF8C00",
  },
  scoreBadgeRed: {
    backgroundColor: `${CyberpunkTheme.colors.error}20`,
    borderColor: CyberpunkTheme.colors.error,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
  },
  headerScoreBadge: {
    paddingVertical: 2,
    paddingHorizontal: CyberpunkTheme.spacing.sm,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    borderWidth: 1,
    marginLeft: CyberpunkTheme.spacing.sm,
  },
  studyCompleteBox: {
    marginTop: CyberpunkTheme.spacing.md,
    backgroundColor: `${CyberpunkTheme.colors.success}15`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.success,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
  },
  studyCompleteTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.success,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  studyCompleteScore: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  studyCompleteDesc: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
  },
  imageGrid: {
    flexDirection: "column",
    gap: CyberpunkTheme.spacing.md,
  },
  imageOption: {
    flexDirection: "column",
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 2,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    overflow: "hidden" as const,
  },
  imageOptionSelected: {
    borderColor: CyberpunkTheme.colors.neonPurple,
    backgroundColor: `${CyberpunkTheme.colors.neonPurple}10`,
    ...CyberpunkTheme.shadows.neonPurple,
  },
  fullWidthImage: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  imageLabelCenter: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    textAlign: "center" as const,
    paddingVertical: CyberpunkTheme.spacing.md,
    paddingHorizontal: CyberpunkTheme.spacing.sm,
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
  conclusionBadgeGrade0: {
    backgroundColor: CyberpunkTheme.colors.success,
  },
  conclusionBadgeGrade1: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
  },
  conclusionBadgeGrade2: {
    backgroundColor: "#FF8C00",
  },
  conclusionBadgeGrade3: {
    backgroundColor: CyberpunkTheme.colors.error,
  },
  conclusionBadgeNotAssessed: {
    backgroundColor: CyberpunkTheme.colors.cardBorder,
  },
  conclusionGradeText: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
    textAlign: "center" as const,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  conclusionScoreText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.background,
    textAlign: "center" as const,
    marginBottom: CyberpunkTheme.spacing.xs,
    opacity: 0.95,
  },
  conclusionDescriptionText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.background,
    textAlign: "center" as const,
    opacity: 0.9,
  },
  conclusionTextNotAssessed: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.textSecondary,
    textAlign: "center" as const,
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
  expandIcon: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    width: 30,
    textAlign: "center" as const,
  },
  expandIconCompleted: {
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
});
