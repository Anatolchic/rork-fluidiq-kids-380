import { TFunction } from "i18next";

export const getScoreText = (score: number, t: TFunction): string => {
  if (score === 0) return `0 ${t("vexus.points")}`;
  if (score === 1) return `1 ${t("vexus.point")}`;
  if (score >= 2 && score <= 4) return `${score} ${t("vexus.pointsAlt")}`;
  return `${score} ${t("vexus.points")}`;
};
