import { useState, useCallback, useMemo } from "react";
import {
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
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePatients } from "@/contexts/PatientsContext";
import { CyberpunkTheme } from "@/constants/theme";
import { Gender } from "@/types/medical";
import { showAlert } from "@/utils/alert";

export default function AddPatientScreen() {
  const { t } = useTranslation();
  const { patientIdExists, addPatient } = usePatients();
  const [patientId, setPatientId] = useState<string>("");
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [ageError, setAgeError] = useState<string>("");
  const [weightError, setWeightError] = useState<string>("");
  const [heightError, setHeightError] = useState<string>("");
  const [protocolModalVisible, setProtocolModalVisible] = useState<boolean>(false);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setPatientId("");
      setGender("male");
      setAge("");
      setWeight("");
      setHeight("");
      setError("");
      setAgeError("");
      setWeightError("");
      setHeightError("");
    }, [])
  );

  const bsa = useMemo(() => {
    const w = parseFloat(weight.replace(",", "."));
    const h = parseFloat(height.replace(",", "."));
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return undefined;
    return Math.round(Math.sqrt((h * w) / 3600) * 100) / 100;
  }, [weight, height]);

  const validateFields = (): boolean => {
    let valid = true;
    setError("");
    setAgeError("");
    setWeightError("");
    setHeightError("");

    if (!patientId.trim()) {
      setError(t("addPatient.patientIdRequired"));
      valid = false;
    }

    if (patientId.length > 25) {
      setError(t("addPatient.patientIdTooLong"));
      valid = false;
    }

    if (patientIdExists(patientId.trim())) {
      setError(t("addPatient.patientIdExists"));
      valid = false;
    }

    const ageNum = parseInt(age, 10);
    if (!age.trim() || isNaN(ageNum)) {
      setAgeError(t("addPatient.ageRequired"));
      valid = false;
    } else if (ageNum >= 12) {
      setAgeError(t("addPatient.ageError"));
      valid = false;
    } else if (ageNum < 0) {
      setAgeError(t("addPatient.ageRequired"));
      valid = false;
    }

    const weightNum = parseFloat(weight.replace(",", "."));
    if (!weight.trim() || isNaN(weightNum)) {
      setWeightError(t("addPatient.weightRequired"));
      valid = false;
    } else if (weightNum < 0.3 || weightNum > 130) {
      setWeightError(t("addPatient.weightError"));
      valid = false;
    }

    const heightNum = parseFloat(height.replace(",", "."));
    if (!height.trim() || isNaN(heightNum)) {
      setHeightError(t("addPatient.heightRequired"));
      valid = false;
    } else if (heightNum < 30 || heightNum > 230) {
      setHeightError(t("addPatient.heightError"));
      valid = false;
    }

    return valid;
  };

  const handleSave = async () => {
    console.log("Save button pressed");
    if (!validateFields()) return;

    try {
      const ageNum = parseInt(age, 10);
      const weightNum = parseFloat(weight.replace(",", "."));
      const heightNum = parseFloat(height.replace(",", "."));
      const bsaVal = Math.round(Math.sqrt((heightNum * weightNum) / 3600) * 100) / 100;

      await addPatient(patientId.trim(), gender, ageNum, weightNum, heightNum, bsaVal);
      console.log("Patient saved successfully");
      showAlert(t("addPatient.successTitle"), t("addPatient.successMessage"), [
        {
          text: t("common.ok"),
          onPress: () => {
            setPatientId("");
            setGender("male");
            setAge("");
            setWeight("");
            setHeight("");
            setError("");
            setAgeError("");
            setWeightError("");
            setHeightError("");
            router.push("/(tabs)/patients");
          },
        },
      ]);
    } catch (err) {
      console.error("Error saving patient:", err);
      setError(t("addPatient.errorSaving"));
    }
  };

  const handleStartStudy = async () => {
    console.log("Start study button pressed");
    if (!validateFields()) return;

    try {
      const ageNum = parseInt(age, 10);
      const weightNum = parseFloat(weight.replace(",", "."));
      const heightNum = parseFloat(height.replace(",", "."));
      const bsaVal = Math.round(Math.sqrt((heightNum * weightNum) / 3600) * 100) / 100;

      const newPatient = await addPatient(patientId.trim(), gender, ageNum, weightNum, heightNum, bsaVal);
      console.log("Patient created successfully, showing protocol selection");
      setCreatedPatientId(newPatient.id);
      setProtocolModalVisible(true);
    } catch (err) {
      console.error("Error creating patient:", err);
      setError(t("addPatient.errorCreating"));
    }
  };

  const handleProtocolSelection = (protocolType: "responder" | "vexus" | "blines") => {
    console.log("Protocol selected, navigating to study");
    setProtocolModalVisible(false);

    if (!createdPatientId) {
      console.error("Patient not found after creation");
      setError(t("addPatient.errorCreating"));
      return;
    }

    const patientIdToNavigate = createdPatientId;

    setPatientId("");
    setGender("male");
    setAge("");
    setWeight("");
    setHeight("");
    setError("");
    setAgeError("");
    setWeightError("");
    setHeightError("");
    setCreatedPatientId(null);

    if (protocolType === "responder") {
      router.push(`/study/${patientIdToNavigate}`);
    } else if (protocolType === "vexus") {
      router.push(`/vexus-study/${patientIdToNavigate}`);
    } else {
      router.push(`/blines-study/${patientIdToNavigate}`);
    }
  };

  const handleOpenAdultApp = () => {
    void Linking.openURL("https://apps.apple.com/ru/app/fluidiq/id6755046322");
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <Text style={styles.label}>{t("addPatient.patientId")}</Text>
        <TextInput
          style={styles.input}
          value={patientId}
          onChangeText={(text) => {
            setPatientId(text);
            setError("");
          }}
          placeholder={t("addPatient.enterPatientId")}
          placeholderTextColor={CyberpunkTheme.colors.textMuted}
          maxLength={25}
        />
        <Text style={styles.hint}>{t("addPatient.maxLength")}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>{t("addPatient.gender")}</Text>
        <View style={styles.genderContainer}>
          <TouchableOpacity
            style={[
              styles.genderButton,
              gender === "male" && styles.genderButtonActiveMale,
            ]}
            onPress={() => setGender("male")}
          >
            <Text
              style={[
                styles.genderButtonText,
                gender === "male" && styles.genderButtonTextActiveMale,
              ]}
            >
              {t("common.male")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.genderButton,
              gender === "female" && styles.genderButtonActiveFemale,
            ]}
            onPress={() => setGender("female")}
          >
            <Text
              style={[
                styles.genderButtonText,
                gender === "female" && styles.genderButtonTextActiveFemale,
              ]}
            >
              {t("common.female")}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{t("addPatient.age")}</Text>
        <TextInput
          style={[styles.input, ageError ? styles.inputError : null]}
          value={age}
          onChangeText={(text) => {
            setAge(text);
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
            {parseInt(age, 10) >= 12 && (
              <TouchableOpacity style={styles.adultAppLink} onPress={handleOpenAdultApp}>
                <Text style={styles.adultAppLinkText}>{t("addPatient.openAdultApp")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <Text style={styles.label}>{t("addPatient.height")}</Text>
        <TextInput
          style={[styles.input, heightError ? styles.inputError : null]}
          value={height}
          onChangeText={(text) => {
            setHeight(text);
            setHeightError("");
          }}
          placeholder={t("addPatient.enterHeight")}
          placeholderTextColor={CyberpunkTheme.colors.textMuted}
          keyboardType="numeric"
        />
        {heightError ? <Text style={styles.fieldError}>{heightError}</Text> : null}

        <Text style={styles.label}>{t("addPatient.weight")}</Text>
        <TextInput
          style={[styles.input, weightError ? styles.inputError : null]}
          value={weight}
          onChangeText={(text) => {
            setWeight(text);
            setWeightError("");
          }}
          placeholder={t("addPatient.enterWeight")}
          placeholderTextColor={CyberpunkTheme.colors.textMuted}
          keyboardType="numeric"
        />
        {weightError ? <Text style={styles.fieldError}>{weightError}</Text> : null}

        {bsa !== undefined && (
          <View style={styles.bsaContainer}>
            <Text style={styles.bsaLabel}>{t("addPatient.bsa")}:</Text>
            <Text style={styles.bsaValue}>
              {bsa.toFixed(2)} {t("addPatient.bsaUnit")}
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.buttonText}>{t("addPatient.save")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.studyButton}
            onPress={handleStartStudy}
          >
            <Text style={styles.buttonText}>{t("addPatient.startStudy")}</Text>
          </TouchableOpacity>
        </View>
      </View>

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
              onPress={() => handleProtocolSelection("responder")}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.responder")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.protocolButton, styles.protocolButtonVexus]}
              onPress={() => handleProtocolSelection("vexus")}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.vexus")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.protocolButton, styles.protocolButtonBLines]}
              onPress={() => handleProtocolSelection("blines")}
            >
              <Text style={styles.protocolButtonText}>{t("protocolSelection.blines")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  content: {
    padding: CyberpunkTheme.spacing.lg,
  },
  label: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.sm,
    marginTop: CyberpunkTheme.spacing.md,
  },
  input: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    color: CyberpunkTheme.colors.text,
    fontSize: 16,
    ...CyberpunkTheme.shadows.cardGlow,
  },
  inputError: {
    borderColor: CyberpunkTheme.colors.error,
    borderWidth: 2,
  },
  hint: {
    fontSize: 12,
    color: CyberpunkTheme.colors.textMuted,
    marginTop: CyberpunkTheme.spacing.xs,
  },
  error: {
    fontSize: 14,
    color: CyberpunkTheme.colors.error,
    marginTop: CyberpunkTheme.spacing.sm,
  },
  fieldError: {
    fontSize: 13,
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
    fontSize: 15,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.textSecondary,
  },
  bsaValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
  },
  genderContainer: {
    flexDirection: "row",
    gap: CyberpunkTheme.spacing.md,
  },
  genderButton: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.cardGlow,
  },
  genderButtonActiveMale: {
    borderColor: CyberpunkTheme.colors.neonCyan,
    backgroundColor: `${CyberpunkTheme.colors.neonCyan}20`,
    ...CyberpunkTheme.shadows.neonCyan,
  },
  genderButtonActiveFemale: {
    borderColor: CyberpunkTheme.colors.neonPink,
    backgroundColor: `${CyberpunkTheme.colors.neonPink}20`,
    ...CyberpunkTheme.shadows.neonPink,
  },
  genderButtonText: {
    fontSize: 16,
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
  buttonContainer: {
    marginTop: CyberpunkTheme.spacing.xl,
    gap: CyberpunkTheme.spacing.md,
  },
  saveButton: {
    backgroundColor: CyberpunkTheme.colors.neonCyan,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.neonCyan,
  },
  studyButton: {
    backgroundColor: CyberpunkTheme.colors.neonPink,
    borderRadius: CyberpunkTheme.borderRadius.md,
    padding: CyberpunkTheme.spacing.md,
    alignItems: "center",
    ...CyberpunkTheme.shadows.neonPink,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderRadius: CyberpunkTheme.borderRadius.lg,
    padding: CyberpunkTheme.spacing.lg,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: CyberpunkTheme.spacing.lg,
    textAlign: "center" as const,
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
