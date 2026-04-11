export const DefaultTheme = {
  colors: {
    background: "#0B1623",
    cardBackground: "#132236",
    cardBorder: "#1E3350",
    primary: "#E8587A",
    secondary: "#4ECDC4",
    accent: "#FFB347",
    text: "#F0F4F8",
    textSecondary: "#8BA4BE",
    textMuted: "#546B84",
    success: "#56D89B",
    error: "#FF6B7A",
    warning: "#FFD166",
    neonPink: "#E8587A",
    neonCyan: "#4ECDC4",
    neonPurple: "#A78BFA",
    glowPink: "rgba(232, 88, 122, 0.25)",
    glowCyan: "rgba(78, 205, 196, 0.25)",
    glowPurple: "rgba(167, 139, 250, 0.25)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 20,
  },
  shadows: {
    neonPink: {
      shadowColor: "#E8587A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    neonCyan: {
      shadowColor: "#4ECDC4",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    neonPurple: {
      shadowColor: "#A78BFA",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    cardGlow: {
      shadowColor: "#4ECDC4",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 2,
    },
  },
} as const;

export const LightTheme = {
  colors: {
    background: "#F4F7FB",
    cardBackground: "#FFFFFF",
    cardBorder: "#E2EAF2",
    primary: "#E8587A",
    secondary: "#3BBFB3",
    accent: "#F5A623",
    text: "#1A2B3F",
    textSecondary: "#5A7089",
    textMuted: "#8FA3B8",
    success: "#3EBF80",
    error: "#E8506A",
    warning: "#F0B840",
    neonPink: "#E8587A",
    neonCyan: "#3BBFB3",
    neonPurple: "#8B6FE0",
    glowPink: "rgba(232, 88, 122, 0.12)",
    glowCyan: "rgba(59, 191, 179, 0.12)",
    glowPurple: "rgba(139, 111, 224, 0.12)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 20,
  },
  shadows: {
    neonPink: {
      shadowColor: "#E8587A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    neonCyan: {
      shadowColor: "#3BBFB3",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
    neonPurple: {
      shadowColor: "#8B6FE0",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },
    cardGlow: {
      shadowColor: "#1A2B3F",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
  },
} as const;

export const OceanTheme = {
  colors: {
    background: "#091A2A",
    cardBackground: "#0F2840",
    cardBorder: "#1A3D5C",
    primary: "#5CB8FF",
    secondary: "#56D89B",
    accent: "#FFB347",
    text: "#E3F0FB",
    textSecondary: "#8BB5D6",
    textMuted: "#5A89AB",
    success: "#56D89B",
    error: "#FF7085",
    warning: "#FFD166",
    neonPink: "#5CB8FF",
    neonCyan: "#56D89B",
    neonPurple: "#A78BFA",
    glowPink: "rgba(92, 184, 255, 0.25)",
    glowCyan: "rgba(86, 216, 155, 0.25)",
    glowPurple: "rgba(167, 139, 250, 0.25)",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 20,
  },
  shadows: {
    neonPink: {
      shadowColor: "#5CB8FF",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    neonCyan: {
      shadowColor: "#56D89B",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    neonPurple: {
      shadowColor: "#A78BFA",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    cardGlow: {
      shadowColor: "#5CB8FF",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 2,
    },
  },
} as const;

export type AppTheme = typeof DefaultTheme | typeof LightTheme | typeof OceanTheme;

export function getTheme(themeName: "default" | "light" | "ocean"): AppTheme {
  switch (themeName) {
    case "light":
      return LightTheme;
    case "ocean":
      return OceanTheme;
    default:
      return DefaultTheme;
  }
}
