import { PARAMETER_THRESHOLDS, PARAMETER_UNITS_DISPLAY, ResponderStatus, StudyParameters } from "@/types/medical";
import { TFunction } from "i18next";
import { pluralizeYears } from "@/utils/pluralizeYears";

function normalizeDecimalInput(value: string): string {
  return value.replace(',', '.');
}

function formatLocalizedNumber(value: number, language: string): string {
  const usesCommaDecimal = ["ru", "de", "es", "fr"].some((locale) => language.startsWith(locale));
  return usesCommaDecimal ? value.toString().replace('.', ',') : value.toString();
}

export function calculateVariability(max: string, min: string): number | null {
  const maxValue = parseFloat(normalizeDecimalInput(max));
  const minValue = parseFloat(normalizeDecimalInput(min));

  if (isNaN(maxValue) || isNaN(minValue) || maxValue < 0 || minValue < 0) {
    return null;
  }

  if (minValue > maxValue) {
    return null;
  }

  if (maxValue === minValue) {
    return 0;
  }

  const difference = maxValue - minValue;

  const average = (maxValue + minValue) / 2;
  const variability = (difference / average) * 100;

  return Math.round(variability * 10) / 10;
}

export function determineResponderStatus(
  variability: number | null | undefined,
  threshold: number
): ResponderStatus {
  if (variability === null || variability === undefined) {
    return "not-assessed";
  }
  return variability >= threshold ? "responder" : "non-responder";
}

const PARAMETER_WEIGHTS: Record<keyof StudyParameters, number> = {
  lvotVTI: 50,
  femoralArtery: 50,
  carotidArtery: 30,
  brachialArtery: 20,
};

export function calculateFinalConclusion(parameters: StudyParameters): ResponderStatus {
  let totalScore = 0;
  let maxPossibleScore = 0;

  const parameterKeys = Object.keys(parameters) as (keyof StudyParameters)[];

  parameterKeys.forEach((key) => {
    const param = parameters[key];
    if (param.result && param.result !== "not-assessed") {
      const weight = PARAMETER_WEIGHTS[key];
      maxPossibleScore += weight;

      if (param.result === "responder") {
        totalScore += weight;
      }
    }
  });

  if (maxPossibleScore === 0) {
    return "not-assessed";
  }

  const percentageScore = (totalScore / maxPossibleScore) * 100;

  return percentageScore >= 50 ? "responder" : "non-responder";
}

export function generateProtocol(
  patientId: string,
  gender: "male" | "female",
  parameters: StudyParameters,
  conclusion: ResponderStatus,
  date: string,
  t: TFunction,
  language: string,
  patientDetails?: { age?: number; height?: number; weight?: number }
): string {
  const genderText = gender === "male" ? t("common.male") : t("common.female");
  const dateObj = new Date(date);
  const locale = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : language === 'zh' ? 'zh-CN' : 'en-US';

  let protocol = `${t("protocol.title").toUpperCase()}\n\n`;
  protocol += `${t("study.title")}: ${dateObj.toLocaleDateString(locale)} ${dateObj.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}\n`;
  protocol += `${t("patient.patientId")}: ${patientId}\n`;
  protocol += `${t("patient.gender")}: ${genderText}\n`;
  if (patientDetails?.age !== undefined) protocol += `${t("patient.age")}: ${patientDetails.age} ${pluralizeYears(patientDetails.age, language)}\n`;
  if (patientDetails?.height !== undefined) protocol += `${t("patient.height")}: ${patientDetails.height} ${t("patient.cm")}\n`;
  if (patientDetails?.weight !== undefined) protocol += `${t("patient.weight")}: ${patientDetails.weight} ${t("patient.kg")}\n`;
  protocol += `\n`;
  protocol += `${t("study.parametersTitle").toUpperCase()}:\n\n`;

  const parameterEntries: {
    key: keyof StudyParameters;
  }[] = [
    { key: "lvotVTI" },
    { key: "femoralArtery" },
    { key: "carotidArtery" },
    { key: "brachialArtery" },
  ];

  parameterEntries.forEach(({ key }) => {
    const name = t(`parameters.${key}`);
    const param = parameters[key];
    const threshold: number = PARAMETER_THRESHOLDS[key];
    const unit = PARAMETER_UNITS_DISPLAY[key];

    protocol += `${name}:\n`;

    if (
      !param.max ||
      !param.min ||
      param.variability === null ||
      param.variability === undefined
    ) {
      protocol += `  ${t("study.notAssessed")}\n\n`;
    } else {
      protocol += `  Max: ${param.max} ${unit}\n`;
      protocol += `  Min: ${param.min} ${unit}\n`;
      protocol += `  ${t("study.variability")}: ${formatLocalizedNumber(param.variability, language)}%\n`;
      protocol += `  ${t("study.threshold")}: ${formatLocalizedNumber(threshold, language)}%\n`;
      protocol += `  ${param.result === "responder" ? t("study.responder") : t("study.nonResponder")}\n\n`;
    }
  });

  protocol += `${t("study.conclusionTitle")}:\n`;
  protocol += `${conclusion === "responder" ? t("study.responder") : t("study.nonResponder")}\n`;

  return protocol;
}
