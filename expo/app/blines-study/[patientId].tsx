import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Check, Info } from "lucide-react-native";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { pluralizeYears } from "@/utils/pluralizeYears";
import * as Clipboard from "expo-clipboard";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { showAlert } from "@/utils/alert";
import { BLinesCount, BLinesZone } from "@/types/medical";
import { calculateBLinesResults } from "@/utils/blinesCalculations";

const ZONE_COLORS: Record<BLinesCount, string> = {
  "a-lines": "#059669",
  "1-2": "#059669",
  "3-5": "#f59e0b",
  ">5": "#ef4444",
  "pneumothorax": "#4b5563",
  "hydrothorax": "#4b5563",
  "consolidation": "#4b5563",
};

export default function BLinesStudyScreen() {
  const { t, i18n } = useTranslation();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const insets = useSafeAreaInsets();
  const { getPatientById, addStudy } = usePatients();
  const patient = getPatientById(patientId!);

  const [zones, setZones] = useState<BLinesZone[]>(
    Array.from({ length: 8 }, (_, i) => ({
      zoneNumber: i + 1,
    }))
  );
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [imageLayout, setImageLayout] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const alertShownRef = useRef(false);

  useEffect(() => {
    console.log("B-lines study screen mounted for patient:", patientId);
    if (patient) {
      setZones(
        Array.from({ length: 8 }, (_, i) => ({
          zoneNumber: i + 1,
        }))
      );
    }
  }, [patientId, patient]);

  const calculationResults = useMemo(() => {
    return calculateBLinesResults(zones);
  }, [zones]);

  const { 
    totalScore, 
    grayZonesCount, 
    informativeZonesCount, 
    maxPossibleScore, 
    normalizedLUS, 
    scoreFront, 
    scoreBack, 
    conclusion,
    evlwiPrediction
  } = calculationResults;

  useEffect(() => {
    if (grayZonesCount >= 3 && !alertShownRef.current) {
      alertShownRef.current = true;
      showAlert(t("common.error"), t("blines.notInformativeAlert"));
    }
    if (grayZonesCount < 3) {
      alertShownRef.current = false;
    }
  }, [grayZonesCount, t]);



  const allZonesAssessed = useMemo(() => {
    return zones.every((z) => z.count !== undefined);
  }, [zones]);

  const canSaveStudy = useMemo(() => {
    return grayZonesCount >= 3 || allZonesAssessed;
  }, [allZonesAssessed, grayZonesCount]);

  const displayConclusion = useMemo(() => {
    if (grayZonesCount >= 3) {
      return "not-informative";
    }
    if (!allZonesAssessed) {
      return "not-assessed";
    }
    return conclusion;
  }, [grayZonesCount, allZonesAssessed, conclusion]);

  const conclusionForSaving = useMemo(() => {
    if (grayZonesCount >= 3) {
      return "not-informative";
    }
    if (!allZonesAssessed) {
      return "not-assessed";
    }
    return conclusion;
  }, [grayZonesCount, allZonesAssessed, conclusion]);

  const handleZonePress = (zoneNumber: number) => {
    setSelectedZone(zoneNumber);
  };

  const handleSelectCount = (count: BLinesCount) => {
    if (selectedZone === null) return;

    let score: number | undefined = undefined;
    if (count === "a-lines" || count === "1-2") {
      score = 0;
    } else if (count === "3-5") {
      score = 1;
    } else if (count === ">5") {
      score = 2;
    }

    setZones((prev) =>
      prev.map((z) =>
        z.zoneNumber === selectedZone
          ? {
              ...z,
              count,
              score,
            }
          : z
      )
    );

    setSelectedZone(null);
  };

  const getZoneColor = (zone: BLinesZone): string | undefined => {
    if (!zone.count) return undefined;
    return ZONE_COLORS[zone.count];
  };

  const generateBLinesProtocol = (): string => {
    const date = new Date();
    const dateStr = date.toLocaleDateString(i18n.language === "ru" ? "ru-RU" : "en-US");
    const timeStr = date.toLocaleTimeString(i18n.language === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    let protocol = `${t("blines.title")}\n\n`;
    protocol += `${t("study.title")}: ${dateStr} ${timeStr}\n`;
    protocol += `${t("patient.patientId")}: ${patient!.patientId}\n`;
    protocol += `${t("patient.gender")}: ${patient!.gender === "male" ? t("common.male") : t("common.female")}\n`;
    if (patient!.age !== undefined) protocol += `${t("patient.age")}: ${patient!.age} ${pluralizeYears(patient!.age!, i18n.language)}\n`;
    if (patient!.height !== undefined) protocol += `${t("patient.height")}: ${patient!.height} ${t("patient.cm")}\n`;
    if (patient!.weight !== undefined) protocol += `${t("patient.weight")}: ${patient!.weight} ${t("patient.kg")}\n`;
    protocol += `\n`;

    protocol += `${t("blines.conclusionTitle")}:\n`;
    zones.forEach((zone) => {
      if (zone.count) {
        let countText = "";
        if (zone.count === "a-lines") {
          countText = t("blines.aLines");
        } else if (zone.count === "1-2") {
          countText = t("blines.bLines1to2");
        } else if (zone.count === "3-5") {
          countText = t("blines.bLines3to5");
        } else if (zone.count === ">5") {
          countText = t("blines.bLinesOver5");
        } else if (zone.count === "pneumothorax") {
          countText = t("blines.pneumothorax");
        } else if (zone.count === "hydrothorax") {
          countText = t("blines.hydrothorax");
        } else if (zone.count === "consolidation") {
          countText = t("blines.consolidation");
        }
        protocol += `${t("blines.zone")} ${zone.zoneNumber}: ${countText}\n`;
      }
    });

    protocol += `\n${t("blines.protocolTotalScore")}: ${totalScore}`;
    protocol += `\n\n${t("blines.conclusionTitle")}: `;
    if (conclusionForSaving === "no-edema") {
      protocol += t("blines.noEdema");
    } else if (conclusionForSaving === "mild-edema") {
      protocol += t("blines.mildEdema");
    } else if (conclusionForSaving === "moderate-edema") {
      protocol += t("blines.moderateEdema");
    } else if (conclusionForSaving === "severe-edema") {
      protocol += t("blines.severeEdema");
    } else if (conclusionForSaving === "not-informative") {
      protocol += t("blines.notInformativeConclusion");
    } else if (conclusionForSaving === "probably-non-hydrostatic") {
      protocol += t("blines.probablyNonHydrostatic");
    } else {
      protocol += t("blines.notAssessed");
    }
    if (evlwiPrediction) {
      protocol += `\n${t("blines.evlwiPredictionLabel")}: ${t(`blines.${evlwiPrediction}`)}`;
    }
    protocol += `\n`;

    return protocol;
  };

  const capitalizeFirst = (str: string): string => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const handleSave = async () => {
    if (!patient) return;

    if (!canSaveStudy) {
      showAlert(t("common.error"), t("blines.zonesIncomplete"));
      return;
    }

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateBLinesProtocol();

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "blines" as const,
      blinesParameters: {
        zones,
        totalScore,
        grayZonesCount,
        informativeZonesCount,
        maxPossibleScore,
        normalizedLUS,
        scoreFront,
        scoreBack,
        evlwiPrediction,
      },
      conclusion: conclusionForSaving,
      protocol,
    };

    await addStudy(patient.id, newStudy);

    showAlert(t("study.successTitle"), t("blines.studySaved"), [
      {
        text: t("common.ok"),
        onPress: () => {
          router.replace(`/(tabs)/patient/${patient.id}`);
        },
      },
    ]);
  };

  const handleCopy = async () => {
    if (!patient || !canSaveStudy) return;

    const studyId = Date.now().toString();
    const currentDate = new Date().toISOString();
    const protocol = generateBLinesProtocol();

    await Clipboard.setStringAsync(protocol);

    const newStudy = {
      id: studyId,
      date: currentDate,
      protocolType: "blines" as const,
      blinesParameters: {
        zones,
        totalScore,
        grayZonesCount,
        informativeZonesCount,
        maxPossibleScore,
        normalizedLUS,
        scoreFront,
        scoreBack,
        evlwiPrediction,
      },
      conclusion: conclusionForSaving,
      protocol,
    };

    await addStudy(patient.id, newStudy);

    showAlert(t("study.successTitle"), t("blines.protocolCopied"));
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
        <Text style={styles.headerTitle}>{t("blines.title")}</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientInfoText}>
            ID: {patient.patientId} | {patient.gender === "male" ? t("common.male").charAt(0) : t("common.female").charAt(0)}
            {patient.age !== undefined ? ` | ${patient.age} ${pluralizeYears(patient.age!, i18n.language)}` : ""}
          </Text>
        </View>

        <View style={styles.importantNoteBox}>
          <Info color={CyberpunkTheme.colors.neonCyan} size={20} />
          <Text style={styles.importantNoteText}>{t("blines.importantNote")}</Text>
        </View>

        <Text style={styles.instructionText}>{t("blines.instruction")}</Text>

        <View style={styles.imageCard}>
          <View
            style={styles.imageWrapper}
            onLayout={(event: LayoutChangeEvent) => {
              const { width, height, x, y } = event.nativeEvent.layout;
              setImageLayout({ width, height, x, y });
            }}
          >
            <Image
              source={{ uri: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/evmdnej42urwqr5e2gqbi.png" }}
              style={[
                styles.bodyImage,
                imageDimensions && {
                  aspectRatio: imageDimensions.width / imageDimensions.height,
                  height: undefined,
                },
              ]}
              resizeMode="contain"
              onLoad={(event) => {
                const nativeEvent = event.nativeEvent;
                if (nativeEvent && nativeEvent.source && typeof nativeEvent.source === 'object') {
                  const source = nativeEvent.source as { width?: number; height?: number };
                  if (source.width && source.height) {
                    setImageDimensions({ width: source.width, height: source.height });
                    return;
                  }
                }
                setImageDimensions({ width: 1536, height: 1024 });
              }}
            />

            {imageLayout && imageDimensions && [1, 2, 3, 4, 5, 6, 7, 8].map((zoneNum) => {
              const zone = zones.find((z) => z.zoneNumber === zoneNum);
              const zoneColor = zone && getZoneColor(zone);

              const containerWidth = imageLayout.width;
              const containerHeight = imageLayout.height;
              const imageAspectRatio = imageDimensions.width / imageDimensions.height;
              const containerAspectRatio = containerWidth / containerHeight;

              let actualImageWidth: number;
              let actualImageHeight: number;
              let imageOffsetX: number;
              let imageOffsetY: number;

              if (containerAspectRatio > imageAspectRatio) {
                actualImageHeight = containerHeight;
                actualImageWidth = actualImageHeight * imageAspectRatio;
                imageOffsetX = (containerWidth - actualImageWidth) / 2;
                imageOffsetY = 0;
              } else {
                actualImageWidth = containerWidth;
                actualImageHeight = actualImageWidth / imageAspectRatio;
                imageOffsetX = 0;
                imageOffsetY = (containerHeight - actualImageHeight) / 2;
              }

              const zonePositions: { [key: number]: { top: number; left?: number; right?: number } } = {
                1: { top: 0.26, left: 0.36 },
                2: { top: 0.50, left: 0.36 },
                3: { top: 0.45, left: 0.14 },
                4: { top: 0.63, left: 0.19 },
                5: { top: 0.26, right: 0.36 },
                6: { top: 0.50, right: 0.36 },
                7: { top: 0.45, right: 0.14 },
                8: { top: 0.63, right: 0.19 },
              };

              const position = zonePositions[zoneNum];
              const buttonSize = actualImageWidth * 0.13;
              const buttonHalfSize = buttonSize / 2;
              const absolutePosition: any = {
                top: imageOffsetY + actualImageHeight * position.top - buttonHalfSize,
              };

              if (position.left !== undefined) {
                absolutePosition.left = imageOffsetX + actualImageWidth * position.left - buttonHalfSize;
              }
              if (position.right !== undefined) {
                absolutePosition.right = imageOffsetX + actualImageWidth * position.right - buttonHalfSize;
              }

              return (
                <TouchableOpacity
                  key={zoneNum}
                  style={[
                    styles.zoneButton,
                    absolutePosition,
                    {
                      width: buttonSize,
                      height: buttonSize,
                      borderRadius: buttonSize / 2,
                    },
                    zoneColor && {
                      backgroundColor: `${zoneColor}60`,
                      borderWidth: 2,
                      borderColor: zoneColor,
                    },
                  ]}
                  onPress={() => handleZonePress(zoneNum)}
                >
                  {zoneColor ? (
                    <View style={[styles.zoneBadge, { backgroundColor: zoneColor }]} />
                  ) : (
                    <Text style={styles.zoneNumberText}>{zoneNum}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.conclusionCard}>
          <Text style={styles.conclusionTitle}>{t("blines.conclusionTitle")}</Text>
          <View
            style={[
              styles.conclusionBadge,
              displayConclusion === "no-edema" && styles.conclusionBadgeNoEdema,
              displayConclusion === "mild-edema" && styles.conclusionBadgeMildEdema,
              displayConclusion === "moderate-edema" && styles.conclusionBadgeModerateEdema,
              displayConclusion === "severe-edema" && styles.conclusionBadgeSevereEdema,
              displayConclusion === "not-informative" && styles.conclusionBadgeNotInformative,
              displayConclusion === "probably-non-hydrostatic" && styles.conclusionBadgeProbablyNonHydrostatic,
              displayConclusion === "not-assessed" && styles.conclusionBadgeNotAssessed,
            ]}
          >
            {displayConclusion === "not-assessed" ? (
              <Text style={styles.conclusionTextNotAssessed}>
                {t("blines.notAssessed")}
              </Text>
            ) : (
              <>
                <Text style={styles.conclusionText}>
                  {displayConclusion === "no-edema" && capitalizeFirst(t("blines.noEdema"))}
                  {displayConclusion === "mild-edema" && capitalizeFirst(t("blines.mildEdema"))}
                  {displayConclusion === "moderate-edema" && capitalizeFirst(t("blines.moderateEdema"))}
                  {displayConclusion === "severe-edema" && capitalizeFirst(t("blines.severeEdema"))}
                  {displayConclusion === "not-informative" && capitalizeFirst(t("blines.notInformativeConclusion"))}
                  {displayConclusion === "probably-non-hydrostatic" && capitalizeFirst(t("blines.probablyNonHydrostatic"))}
                </Text>
                {evlwiPrediction && (
                  <Text style={styles.evlwiText}>
                    {t("blines.evlwiPredictionLabel")}: {t(`blines.${evlwiPrediction}`)}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {canSaveStudy && (
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
      </ScrollView>

      <Modal
        visible={selectedZone !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedZone(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedZone(null)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t("blines.zone")} {selectedZone}
            </Text>
            <Text style={styles.modalQuestion}>{t("blines.zoneQuestion")}</Text>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["a-lines"] }]}
              onPress={() => handleSelectCount("a-lines")}
            >
              <Text style={styles.optionText}>{t("blines.aLines")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["1-2"] }]}
              onPress={() => handleSelectCount("1-2")}
            >
              <Text style={styles.optionText}>{t("blines.bLines1to2")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["3-5"] }]}
              onPress={() => handleSelectCount("3-5")}
            >
              <Text style={styles.optionText}>{t("blines.bLines3to5")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS[">5"] }]}
              onPress={() => handleSelectCount(">5")}
            >
              <Text style={[styles.optionText, { textAlign: "center" }]}>{t("blines.bLinesOver5")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["pneumothorax"] }]}
              onPress={() => handleSelectCount("pneumothorax")}
            >
              <Text style={styles.optionText}>{t("blines.pneumothorax")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["hydrothorax"] }]}
              onPress={() => handleSelectCount("hydrothorax")}
            >
              <Text style={styles.optionText}>{t("blines.hydrothorax")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: ZONE_COLORS["consolidation"] }]}
              onPress={() => handleSelectCount("consolidation")}
            >
              <Text style={styles.optionText}>{t("blines.consolidation")}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    borderColor: CyberpunkTheme.colors.neonPink,
    ...CyberpunkTheme.shadows.neonPink,
  },
  patientInfoText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    textAlign: "center",
  },
  importantNoteBox: {
    flexDirection: "row",
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}15`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.lg,
    gap: CyberpunkTheme.spacing.sm,
  },
  importantNoteText: {
    flex: 1,
    fontSize: 13,
    color: CyberpunkTheme.colors.text,
    lineHeight: 18,
  },
  instructionText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.neonPurple,
    textAlign: "center",
    marginBottom: CyberpunkTheme.spacing.md,
    fontWeight: "600" as const,
  },
  imageCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.sm,
    marginBottom: CyberpunkTheme.spacing.lg,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  imageWrapper: {
    position: "relative",
    width: "100%",
  },
  bodyImage: {
    width: "100%",
    aspectRatio: 1536 / 1024,
  },
  zoneButton: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  zoneBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  zoneNumberText: {
    fontSize: 26,
    fontWeight: "700" as const,
    color: "#ffffff",
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
    padding: CyberpunkTheme.spacing.md,
    borderRadius: CyberpunkTheme.borderRadius.md,
  },
  conclusionBadgeNoEdema: {
    backgroundColor: "#047857",
  },
  conclusionBadgeMildEdema: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
  },
  conclusionBadgeModerateEdema: {
    backgroundColor: "#FF8C00",
  },
  conclusionBadgeSevereEdema: {
    backgroundColor: CyberpunkTheme.colors.error,
  },
  conclusionBadgeNotInformative: {
    backgroundColor: CyberpunkTheme.colors.cardBorder,
  },
  conclusionBadgeProbablyNonHydrostatic: {
    backgroundColor: "#9333ea",
  },
  conclusionBadgeNotAssessed: {
    backgroundColor: CyberpunkTheme.colors.cardBorder,
  },
  conclusionText: {
    fontSize: 23,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  conclusionTextNotAssessed: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.textSecondary,
    textAlign: "center" as const,
  },
  evlwiText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    textAlign: "center" as const,
    marginTop: CyberpunkTheme.spacing.sm,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: CyberpunkTheme.spacing.lg,
  },
  modalContent: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderRadius: CyberpunkTheme.borderRadius.lg,
    padding: CyberpunkTheme.spacing.lg,
    width: "100%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: CyberpunkTheme.colors.neonCyan,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    marginBottom: CyberpunkTheme.spacing.sm,
    textAlign: "center",
  },
  modalQuestion: {
    fontSize: 16,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.lg,
    textAlign: "center",
  },
  optionButton: {
    padding: CyberpunkTheme.spacing.md,
    borderRadius: CyberpunkTheme.borderRadius.md,
    marginBottom: CyberpunkTheme.spacing.sm,
    alignItems: "center",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.background,
  },
});
