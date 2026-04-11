export function pluralizeYears(age: number, language: string): string {
  if (language === "ru") {
    const abs = Math.abs(age);
    const lastTwo = abs % 100;
    const lastOne = abs % 10;

    if (lastTwo >= 11 && lastTwo <= 19) {
      return "лет";
    }
    if (lastOne === 1) {
      return "год";
    }
    if (lastOne >= 2 && lastOne <= 4) {
      return "года";
    }
    return "лет";
  }

  if (language === "de") {
    return age === 1 ? "Jahr" : "Jahre";
  }

  if (language === "es") {
    return age === 1 ? "año" : "años";
  }

  if (language === "fr") {
    return age <= 1 ? "an" : "ans";
  }

  if (language === "zh") {
    return "岁";
  }

  return age === 1 ? "year" : "years";
}
