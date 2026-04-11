import { BLinesZone, BLinesConclusion, BLinesCount } from "@/types/medical";

export interface BLinesCalculationResult {
  totalScore?: number;
  grayZonesCount: number;
  informativeZonesCount: number;
  maxPossibleScore: number;
  normalizedLUS?: number;
  scoreFront: number;
  scoreBack: number;
  conclusion: BLinesConclusion;
  evlwiPrediction?: string;
}

const FRONT_ZONES = [1, 2, 5, 6];
const BACK_ZONES = [3, 4, 7, 8];

function isNonInformativeCount(count?: BLinesCount): boolean {
  return (
    count === "pneumothorax" ||
    count === "hydrothorax" ||
    count === "consolidation"
  );
}

function getScoreForCount(count?: BLinesCount): number | undefined {
  if (!count) return undefined;
  
  if (isNonInformativeCount(count)) {
    return undefined;
  }
  
  switch (count) {
    case "a-lines":
    case "1-2":
      return 0;
    case "3-5":
      return 1;
    case ">5":
      return 2;
    default:
      return undefined;
  }
}

export function calculateBLinesResults(zones: BLinesZone[]): BLinesCalculationResult {
  const allAssessed = zones.every((z) => z.count !== undefined);
  
  const grayZonesCount = zones.filter((z) => isNonInformativeCount(z.count)).length;
  
  if (!allAssessed) {
    return {
      grayZonesCount,
      informativeZonesCount: 0,
      maxPossibleScore: 0,
      scoreFront: 0,
      scoreBack: 0,
      conclusion: "not-assessed",
      evlwiPrediction: undefined,
    };
  }
  
  if (grayZonesCount >= 3) {
    return {
      grayZonesCount,
      informativeZonesCount: 8 - grayZonesCount,
      maxPossibleScore: (8 - grayZonesCount) * 2,
      scoreFront: 0,
      scoreBack: 0,
      conclusion: "not-informative",
      evlwiPrediction: undefined,
    };
  }
  
  const informativeZonesCount = 8 - grayZonesCount;
  const maxPossibleScore = informativeZonesCount * 2;
  
  let totalScore = 0;
  let scoreFront = 0;
  let scoreBack = 0;
  
  zones.forEach((zone) => {
    const score = getScoreForCount(zone.count);
    if (score !== undefined) {
      totalScore += score;
      
      if (FRONT_ZONES.includes(zone.zoneNumber)) {
        scoreFront += score;
      } else if (BACK_ZONES.includes(zone.zoneNumber)) {
        scoreBack += score;
      }
    }
  });
  
  const normalizedLUS = maxPossibleScore > 0 
    ? Math.round((totalScore / maxPossibleScore) * 100 * 10) / 10 
    : 0;
  
  if (scoreFront >= 2 && scoreBack <= 1) {
    return {
      totalScore,
      grayZonesCount,
      informativeZonesCount,
      maxPossibleScore,
      normalizedLUS,
      scoreFront,
      scoreBack,
      conclusion: "probably-non-hydrostatic",
      evlwiPrediction: undefined,
    };
  }
  
  let conclusion: BLinesConclusion;
  let evlwiPrediction: string | undefined;
  
  if (normalizedLUS < 15) {
    conclusion = "no-edema";
    evlwiPrediction = "evlwi_less_7";
  } else if (normalizedLUS >= 15 && normalizedLUS <= 44) {
    if (scoreFront === 0) {
      conclusion = "mild-edema";
      evlwiPrediction = "evlwi_7_10";
    } else {
      conclusion = "moderate-edema";
      evlwiPrediction = "evlwi_11_14";
    }
  } else if (normalizedLUS >= 45 && normalizedLUS <= 69) {
    if (scoreFront >= 1) {
      conclusion = "moderate-edema";
      evlwiPrediction = "evlwi_11_14";
    } else {
      conclusion = "mild-edema";
      evlwiPrediction = "evlwi_7_10";
    }
  } else {
    conclusion = "severe-edema";
    evlwiPrediction = "evlwi_15_plus";
  }
  
  return {
    totalScore,
    grayZonesCount,
    informativeZonesCount,
    maxPossibleScore,
    normalizedLUS,
    scoreFront,
    scoreBack,
    conclusion,
    evlwiPrediction,
  };
}
