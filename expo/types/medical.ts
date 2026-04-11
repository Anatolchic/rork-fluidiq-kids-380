export type Gender = "male" | "female";

export type ResponderStatus = "responder" | "non-responder" | "not-assessed";

export type ProtocolType = "responder" | "vexus" | "plr" | "blines";

export type VExUSGrade = "grade-0" | "grade-1" | "grade-2" | "grade-3" | "not-assessed";

export type DopplerPattern = "normal" | "mildly-abnormal" | "severely-abnormal" | "not-assessed";

export interface ParameterMeasurement {
  max: string;
  min: string;
  variability?: number;
  result?: ResponderStatus;
}

export interface StudyParameters {
  carotidArtery: ParameterMeasurement;
  brachialArtery: ParameterMeasurement;
  femoralArtery: ParameterMeasurement;
  lvotVTI: ParameterMeasurement;
}

export interface PreConditions {
  sinusRhythm: boolean;
  ventilationOrBreathHold: boolean;
}

export interface VExUSParameters {
  dmaxIVC: string;
  dmaxResult?: "less-than-20" | "greater-than-20";
  ivcIndex?: number;
  ivcScore?: number;
  hepaticVeinDoppler?: DopplerPattern;
  hepaticScore?: number;
  portalVeinVmin?: string;
  portalVeinVmax?: string;
  portalVeinPI?: number;
  portalVeinResult?: DopplerPattern;
  portalScore?: number;
  renalVeinDoppler?: DopplerPattern;
  renalScore?: number;
  totalScore?: number;
}

export interface VExUSPreConditions {
  sinusRhythm: boolean;
  noCirrhosis: boolean;
  noIntraAbdominalHypertension: boolean;
}

export interface PLRMeasurement {
  value: string;
}

export interface PLRParameters {
  beforePLR: PLRMeasurement[];
  afterPLR: PLRMeasurement[];
  averageBeforePLR?: number;
  averageAfterPLR?: number;
  variability?: number;
}

export interface PLRPreConditions {
  normalICP: boolean;
  canPerformPLR: boolean;
}

export type BLinesCount = "a-lines" | "1-2" | "3-5" | ">5" | "pneumothorax" | "hydrothorax" | "consolidation";

export interface BLinesZone {
  zoneNumber: number;
  count?: BLinesCount;
  score?: number;
}

export type BLinesConclusion = "no-edema" | "mild-edema" | "moderate-edema" | "severe-edema" | "not-informative" | "probably-non-hydrostatic" | "not-assessed";

export interface BLinesParameters {
  zones: BLinesZone[];
  totalScore?: number;
  grayZonesCount?: number;
  informativeZonesCount?: number;
  maxPossibleScore?: number;
  normalizedLUS?: number;
  scoreFront?: number;
  scoreBack?: number;
  evlwiPrediction?: string;
}

export interface StudyBase {
  id: string;
  date: string;
  protocol: string;
  protocolType: ProtocolType;
}

export interface ResponderStudy extends StudyBase {
  protocolType: "responder";
  parameters: StudyParameters;
  preConditions: PreConditions;
  conclusion: ResponderStatus;
}

export interface VExUSStudy extends StudyBase {
  protocolType: "vexus";
  vexusParameters: VExUSParameters;
  vexusPreConditions: VExUSPreConditions;
  conclusion: VExUSGrade;
  totalScore?: number;
}

export interface PLRStudy extends StudyBase {
  protocolType: "plr";
  plrParameters: PLRParameters;
  plrPreConditions: PLRPreConditions;
  conclusion: ResponderStatus;
}

export interface BLinesStudy extends StudyBase {
  protocolType: "blines";
  blinesParameters: BLinesParameters;
  conclusion: BLinesConclusion;
}

export type Study = ResponderStudy | VExUSStudy | PLRStudy | BLinesStudy;

export interface Patient {
  id: string;
  patientId: string;
  gender: Gender;
  age?: number;
  weight?: number;
  height?: number;
  bsa?: number;
  studies: Study[];
  createdAt: string;
}

export const PARAMETER_THRESHOLDS = {
  carotidArtery: 16.5,
  brachialArtery: 10,
  femoralArtery: 12.3,
  lvotVTI: 12.5,
} as const;

export const PARAMETER_NAMES = {
  carotidArtery: "Вариабельность пиковой скорости на общей сонной артерии",
  brachialArtery: "Вариабельность пиковой скорости на плечевой артерии",
  femoralArtery: "Вариабельность пиковой скорости на аорте",
  lvotVTI: "Вариабельность VTI на выносящем тракте левого желудочка",
} as const;

export const PARAMETER_UNITS = {
  carotidArtery: { max: "PSVmax", min: "PSVmin" },
  brachialArtery: { max: "PSVmax", min: "PSVmin" },
  femoralArtery: { max: "PSVmax", min: "PSVmin" },
  lvotVTI: { max: "VTImax", min: "VTImin" },
} as const;

export const PARAMETER_UNITS_DISPLAY = {
  carotidArtery: "cm/s",
  brachialArtery: "cm/s",
  femoralArtery: "cm/s",
  lvotVTI: "cm",
} as const;
