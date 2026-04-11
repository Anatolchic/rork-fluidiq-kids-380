import { router, Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { Edit, Trash2, ArrowLeft } from "lucide-react-native";
import { useState, useEffect, useMemo } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { pluralizeYears } from "@/utils/pluralizeYears";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { Gender, Study, VExUSStudy } from "@/types/medical";
import { showAlert } from "@/utils/alert";
import { getScoreText } from "@/utils/scoreText";

export default function PatientDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { getPatientById, updatePatient, deletePatient, deleteStudy, patientIdExists } =
    usePatients();
  const patient = getPatientById(id!);

  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editPatientId, setEditPatientId] = useState<string>("");
  const [editGender, setEditGender] = useState<Gender>("male");
  const [editAge, setEditAge] = useState<string>("");
  const [editWeight, setEditWeight] = useState<string>("");
  const [editHeight, setEditHeight] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [ageError, setAgeError] = useState<string>("");
  const [weightError, setWeightError] = useState<string>("");
  const [heightError, setHeightError] = useState<string>("");
  const [protocolModalVisible, setProtocolModalVisible] = useState<boolean>(false);
  const navigation = useNavigation();

  const editBsa = useMemo(() => {
    const w = parseFloat(editWeight.replace(",", "."));
    const h = parseFloat(editHeight.replace(",", "."));
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return undefined;
    return Math.round(Math.sqrt((h * w) / 3600) * 100) / 100;
  }, [editWeight, editHeight]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      router.replace('/(tabs)/patients');
    });
    return unsubscribe;
  }, [navigation]);

  if (!patient) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("patient.notFound")}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/patients')}>
            <Text style={styles.backButtonText}>{t("common.back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleEdit = () => {
    setEditPatientId(patient.patientId);
    setEditGender(patient.gender);
    setEditAge(patient.age !== undefined ? String(patient.age) : "");
    setEditWeight(patient.weight !== undefined ? String(patient.weight) : "");
    setEditHeight(patient.height !== undefined ? String(patient.height) : "");
    setError("");
    setAgeError("");
    setWeightError("");
    setHeightError("");
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    let valid = true;
    setError("");
    setAgeError("");
    setWeightError("");
    setHeightError("");

    if (!editPatientId.trim()) {
      setError(t("addPatient.patientIdRequired"));
      valid = false;
    }
    if (editPatientId.length > 30) {
      setError(t("addPatient.patientIdTooLong"));
      valid = false;
    }
    if (patientIdExists(editPatientId.trim(), patient.id)) {
      setError(t("addPatient.patientIdExists"));
      valid = false;
    }

    const ageNum = parseInt(editAge, 10);
    if (!editAge.trim() || isNaN(ageNum)) {
      setAgeError(t("addPatient.ageRequired"));
      valid = false;
    } else if (ageNum >= 12) {
      setAgeError(t("addPatient.ageError"));
      valid = false;
    } else if (ageNum < 0) {
      setAgeError(t("addPatient.ageRequired"));
      valid = false;
    }

    const weightNum = parseFloat(editWeight.replace(",", "."));
    if (!editWeight.trim() || isNaN(weightNum)) {
      setWeightError(t("addPatient.weightRequired"));
      valid = false;
    } else if (weightNum < 0.3 || weightNum > 130) {
      setWeightError(t("addPatient.weightError"));
      valid = false;
    }

    const heightNum = parseFloat(editHeight.replace(",", "."));
    if (!editHeight.trim() || isNaN(heightNum)) {
      setHeightError(t("addPatient.heightRequired"));
      valid = false;
    } else if (heightNum < 30 || heightNum > 230) {
      setHeightError(t("addPatient.heightError"));
      valid = false;
    }

    if (!valid) return;

    const bsaVal = Math.round(Math.sqrt((heightNum * weightNum) / 3600) * 100) / 100;
    await updatePatient(patient.id, editPatientId.trim(), editGender, ageNum, weightNum, heightNum, bsaVal);
    setEditModalVisible(false);
  };

  const handleDelete = () => {
    showAlert(
      t("patient.deletePatientTitle"),
      t("patient.deletePatientMessage", { id: patient.patientId }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await deletePatient(patient.id);
            router.replace('/(tabs)/patients');
          },
        },
      ]
    );
  };

  const handleDeleteStudy = (study: Study) => {
    showAlert(
      t("patient.deleteStudyTitle"),
      t("patient.deleteStudyMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteStudy(patient.id, study.id);
          },
        },
      ]
    );
  };

  const getVexusTotalScore = (study: Study): number | undefined => {
    if (study.protocolType === "vexus") {
      const vStudy = study as VExUSStudy;
      if (vStudy.totalScore !== undefined) return vStudy.totalScore;
      if (vStudy.vexusParameters?.totalScore !== undefined) return vStudy.vexusParameters.totalScore;
    }
    return undefined;
  };

  const renderStudy = ({ item }: { item: Study }) => {
    const date = new Date(item.date);
    const studyDate = date.toLocaleDateString("ru-RU");
    const studyTime = date.toLocaleTimeString("ru-RU", { hour: '2-digit', minute: '2-digit' });
    const conclusion = item.conclusion;

    let conclusionText = "";
    let isPositive = false;

    if (item.protocolType === "responder") {
      conclusionText = conclusion === "responder" ? t("patient.responder") : t("patient.nonResponder");
      isPositive = conclusion === "responder";
    } else if (item.protocolType === "vexus") {
      const score = getVexusTotalScore(item);
      const scoreStr = score !== undefined ? ` (${getScoreText(score, t)})` : "";
      if (conclusion === "grade-0") {
        conclusionText = t("vexus.grade0") + scoreStr + " (p-VExUS)";
        isPositive = true;
      } else if (conclusion === "grade-1") {
        conclusionText = t("vexus.grade1") + scoreStr + " (p-VExUS)";
      } else if (conclusion === "grade-2") {
        conclusionText = t("vexus.grade2") + scoreStr + " (p-VExUS)";
      } else if (conclusion === "grade-3") {
        conclusionText = t("vexus.grade3") + scoreStr + " (p-VExUS)";
      }
    } else if (item.protocolType === "plr") {
      const suffix = " (LVOT VTI + PLR)";
      conclusionText = conclusion === "responder" ? t("patient.responder") + suffix : t("patient.nonResponder") + suffix;
      isPositive = conclusion === "responder";
    } else if (item.protocolType === "blines") {
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
    }

    return (
      <TouchableOpacity
        style={styles.studyCard}
        onPress={() =>
          router.push({
            pathname: "/protocol/[studyId]",
            params: { studyId: item.id, patientId: patient.id },
          })
        }
      >
        <View style={styles.studyInfo}>
          <Text style={styles.studyDate}>{studyDate} {studyTime}</Text>
          <Text style={[styles.studyResult, isPositive && styles.studyResultResponder]}>
            {conclusionText}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteStudyButton}
          onPress={(e) => {
            e.stopPropagation();
            handleDeleteStudy(item);
          }}
        >
          <Trash2 color={CyberpunkTheme.colors.error} size={20} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/patients')} style={styles.backIconButton}>
          <ArrowLeft color={CyberpunkTheme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("patient.title")}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleEdit} style={styles.headerIconButton}>
            <Edit color={CyberpunkTheme.colors.neonCyan} size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.headerIconButton}>
            <Trash2 color={CyberpunkTheme.colors.error} size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("patient.patientId")}</Text>
          <Text style={styles.infoValue}>{patient.patientId}</Text>

          <Text style={styles.infoLabel}>{t("patient.gender")}</Text>
          <Text style={styles.infoValue}>
            {patient.gender === "male" ? t("common.male") : t("common.female")}
          </Text>

          {patient.age !== undefined && (
            <>
              <Text style={styles.infoLabel}>{t("patient.age")}</Text>
              <Text style={styles.infoValue}>{patient.age} {pluralizeYears(patient.age!, i18n.language)}</Text>
            </>
          )}

          {patient.height !== undefined && (
            <>
              <Text style={styles.infoLabel}>{t("patient.height")}</Text>
              <Text style={styles.infoValue}>{patient.height} {t("patient.cm")}</Text>
            </>
          )}

          {patient.weight !== undefined && (
            <>
              <Text style={styles.infoLabel}>{t("patient.weight")}</Text>
              <Text style={styles.infoValue}>{patient.weight} {t("patient.kg")}</Text>
            </>
          )}

          {patient.bsa !== undefined && (
            <>
              <Text style={styles.infoLabel}>{t("patient.bsa")}</Text>
              <Text style={styles.infoValueHighlight}>{patient.bsa.toFixed(2)} {t("patient.m2")}</Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.startStudyButton}
          onPress={() => setProtocolModalVisible(true)}
        >
          <Text style={styles.startStudyButtonText}>{t("patient.performStudy")}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{t("patient.studyHistory")}</Text>

        {patient.studies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t("patient.noStudies")}</Text>
          </View>
        ) : (
          <FlatList
            data={patient.studies}
            renderItem={renderStudy}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t("patient.editPatient")}</Text>

              <Text style={styles.label}>{t("patient.patientId")}</Text>
              <TextInput
                style={styles.input}
                value={editPatientId}
                onChangeText={(text) => { setEditPatientId(text); setError(""); }}
                placeholder={t("addPatient.enterPatientId")}
                placeholderTextColor={CyberpunkTheme.colors.textMuted}
                maxLength={30}
              />
              {error ? <Text style={styles.fieldError}>{error}</Text> : null}

              <Text style={styles.label}>{t("patient.gender")}</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[styles.genderButton, editGender === "male" && styles.genderButtonActiveMale]}
                  onPress={() => setEditGender("male")}
                >
                  <Text style={[styles.genderButtonText, editGender === "male" && styles.genderButtonTextActiveMale]}>
                    {t("common.male")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.genderButton, editGender === "female" && styles.genderButtonActiveFemale]}
                  onPress={() => setEditGender("female")}
                >
                  <Text style={[styles.genderButtonText, editGender === "female" && styles.genderButtonTextActiveFemale]}>
                    {t("common.female")}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t("addPatient.age")}</Text>
              <TextInput
                style={[styles.input, ageError ? styles.inputError : null]}
                value={editAge}
                onChangeText={(text) => {
                  setEditAge(text);
                  const ageNum = parseInt(text, 10);
                  if (!isNaN(ageNum) && ageNum >= 12) {
                    setAgeError(t("addPatient.ageError"));
                  } else {
                    setAgeError("");
                  }
                }}
                placeholder={t("addPatient.enterAge")}
                placeholderTextColor={CyberpunkTheme.colors.textMuted}
                keyboardType="numeric"
              />
              {ageError ? (
                <View>
                  <Text style={styles.fieldError}>{ageError}</Text>
                  {parseInt(editAge, 10) >= 12 && (
                    <TouchableOpacity
                      style={styles.adultAppLink}
                      onPress={() => Linking.openURL("https://apps.apple.com/ru/app/fluidiq/id6755046322")}
                    >
                      <Text style={styles.adultAppLinkText}>{t("addPatient.openAdultApp")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              <Text style={styles.label}>{t("addPatient.height")}</Text>
              <TextInput
                style={[styles.input, heightError ? styles.inputError : null]}
                value={editHeight}
                onChangeText={(text) => { setEditHeight(text); setHeightError(""); }}
                placeholder={t("addPatient.enterHeight")}
                placeholderTextColor={CyberpunkTheme.colors.textMuted}
                keyboardType="numeric"
              />
              {heightError ? <Text style={styles.fieldError}>{heightError}</Text> : null}

              <Text style={styles.label}>{t("addPatient.weight")}</Text>
              <TextInput
                style={[styles.input, weightError ? styles.inputError : null]}
                value={editWeight}
                onChangeText={(text) => { setEditWeight(text); setWeightError(""); }}
                placeholder={t("addPatient.enterWeight")}
                placeholderTextColor={CyberpunkTheme.colors.textMuted}
                keyboardType="numeric"
              />
              {weightError ? <Text style={styles.fieldError}>{weightError}</Text> : null}

              {editBsa !== undefined && (
                <View style={styles.bsaContainer}>
                  <Text style={styles.bsaLabel}>{t("addPatient.bsa")}:</Text>
                  <Text style={styles.bsaValue}>{editBsa.toFixed(2)} {t("addPatient.bsaUnit")}</Text>
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.modalButtonCancelText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonSave} onPress={handleSaveEdit}>
                  <Text style={styles.modalButtonSaveText}>{t("common.save")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={protocolModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProtocolModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setProtocolModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>{t("protocolSelection.title")}</Text>

            <TouchableOpacity
              style={[styles.protocolButton, styles.protocolButtonResponder]}
              onPress={() => {
                setProtocolModalVisible(false);
                router.push(`/study/${patient.id}`);
              }}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.responder")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.protocolButton, styles.protocolButtonVexus]}
              onPress={() => {
                setProtocolModalVisible(false);
                router.push(`/vexus-study/${patient.id}`);
              }}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.vexus")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.protocolButton, styles.protocolButtonBLines]}
              onPress={() => {
                setProtocolModalVisible(false);
                router.push(`/blines-study/${patient.id}`);
              }}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.blines")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
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
  headerActions: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.sm,
  },
  headerIconButton: {
    padding: CyberpunkTheme.spacing.sm,
  },
  content: {
    flex: 1,
    padding: CyberpunkTheme.spacing.md,
  },
  infoCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: "rgba(200, 200, 200, 0.3)",
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  infoLabel: {
    fontSize: 12,
    color: CyberpunkTheme.colors.textMuted,
    marginBottom: CyberpunkTheme.spacing.xs,
    marginTop: CyberpunkTheme.spacing.sm,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  infoValueHighlight: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  startStudyButton: {
    backgroundColor: CyberpunkTheme.colors.neonPink,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    marginBottom: CyberpunkTheme.spacing.xl,
    ...CyberpunkTheme.shadows.neonPink,
  },
  startStudyButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    marginBottom: CyberpunkTheme.spacing.md,
  },
  studyCard: {
    flexDirection: "row",
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: "rgba(200, 200, 200, 0.3)",
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginBottom: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.cardGlow,
  },
  studyInfo: {
    flex: 1,
  },
  studyDate: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.xs,
  },
  studyResult: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.error,
  },
  studyResultResponder: {
    color: CyberpunkTheme.colors.success,
  },
  deleteStudyButton: {
    padding: CyberpunkTheme.spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    padding: CyberpunkTheme.spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollView: {
    width: "100%",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderRadius: CyberpunkTheme.borderRadius.lg,
    padding: CyberpunkTheme.spacing.lg,
    width: "90%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.lg,
    textAlign: "center" as const,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.sm,
    marginTop: CyberpunkTheme.spacing.md,
  },
  input: {
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    color: CyberpunkTheme.colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: CyberpunkTheme.colors.error,
    borderWidth: 2,
  },
  fieldError: {
    fontSize: 12,
    color: CyberpunkTheme.colors.error,
    marginTop: CyberpunkTheme.spacing.xs,
    fontWeight: "600" as const,
  },
  adultAppLink: {
    marginTop: CyberpunkTheme.spacing.sm,
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}20`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    paddingVertical: CyberpunkTheme.spacing.sm,
    paddingHorizontal: CyberpunkTheme.spacing.md,
    alignSelf: "flex-start" as const,
  },
  adultAppLinkText: {
    fontSize: 13,
    color: CyberpunkTheme.colors.neonCyan,
    fontWeight: "600" as const,
  },
  bsaContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}15`,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    marginTop: CyberpunkTheme.spacing.md,
    gap: CyberpunkTheme.spacing.sm,
  },
  bsaLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.textSecondary,
  },
  bsaValue: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  genderContainer: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.md,
  },
  genderButton: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
  },
  genderButtonActiveMale: {
    borderColor: CyberpunkTheme.colors.neonCyan,
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}20`,
  },
  genderButtonActiveFemale: {
    borderColor: CyberpunkTheme.colors.neonPink,
    backgroundColor: `${CyberpunkTheme.colors.neonPink}20`,
  },
  genderButtonText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
    fontWeight: "500" as const,
  },
  genderButtonTextActiveMale: {
    color: CyberpunkTheme.colors.neonCyan,
    fontWeight: "700" as const,
  },
  genderButtonTextActiveFemale: {
    color: CyberpunkTheme.colors.neonPink,
    fontWeight: "700" as const,
  },
  modalButtons: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.md,
    marginTop: CyberpunkTheme.spacing.xl,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
  },
  modalButtonSave: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
  },
  modalButtonSaveText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  protocolButton: {
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.lg,
    alignItems: "center",
    marginTop: CyberpunkTheme.spacing.md,
  },
  protocolButtonResponder: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  protocolButtonVexus: {
    backgroundColor: CyberpunkTheme.colors.neonPurple,
    ...CyberpunkTheme.shadows.neonPurple,
  },
  protocolButtonBLines: {
    backgroundColor: CyberpunkTheme.colors.neonPink,
    ...CyberpunkTheme.shadows.neonPink,
  },
  protocolButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
});
