import React, { useState, useCallback, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CyberpunkTheme } from "@/constants/theme";
import { ChevronDown, BookOpen, Activity, Heart, Wind } from "lucide-react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, accentColor, children, defaultOpen = false }: SectionProps) {
  const [expanded, setExpanded] = useState<boolean>(defaultOpen);
  const rotateAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotateAnim, {
      toValue: expanded ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setExpanded((prev) => !prev);
  }, [expanded, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={[sectionStyles.container, { borderLeftColor: accentColor }]}>
      <TouchableOpacity
        style={sectionStyles.header}
        onPress={toggle}
        activeOpacity={0.7}
      >
        <View style={sectionStyles.headerLeft}>
          {icon}
          <Text style={[sectionStyles.headerTitle, { color: accentColor }]}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevronDown size={20} color={accentColor} />
        </Animated.View>
      </TouchableOpacity>
      {expanded && <View style={sectionStyles.body}>{children}</View>}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderRadius: CyberpunkTheme.borderRadius.md,
    borderLeftWidth: 3,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    marginLeft: 10,
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});

function FormulaBox({ children }: { children: string }) {
  return (
    <View style={styles.formulaBox}>
      <Text style={styles.formulaText}>{children}</Text>
    </View>
  );
}

function TableRow({ cells, isHeader = false }: { cells: string[]; isHeader?: boolean }) {
  return (
    <View style={[styles.tableRow, isHeader && styles.tableHeaderRow]}>
      {cells.map((cell, i) => (
        <View key={i} style={[styles.tableCell, i === 0 && styles.tableCellFirst]}>
          <Text
            style={[
              styles.tableCellText,
              isHeader && styles.tableHeaderText,
            ]}
          >
            {cell}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"}{children}</Text>;
}

function BulletPoint({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function SubHeader({ children }: { children: string }) {
  return <Text style={styles.subHeader}>{children}</Text>;
}

export default function MaterialsScreen() {
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{t("materialsContent.heroTitle")}</Text>
        <Text style={styles.heroSubtitle}>
          {t("materialsContent.heroSubtitle")}
        </Text>
      </View>

      <CollapsibleSection
        title={t("materialsContent.introTitle")}
        icon={<BookOpen size={18} color={CyberpunkTheme.colors.neonCyan} />}
        accentColor={CyberpunkTheme.colors.neonCyan}
        defaultOpen={true}
      >
        <Paragraph>{t("materialsContent.introP1")}</Paragraph>
        <Paragraph>{t("materialsContent.introP2")}</Paragraph>
        <Paragraph>{t("materialsContent.introP3")}</Paragraph>
        <BulletPoint>{t("materialsContent.introBullet1")}</BulletPoint>
        <BulletPoint>{t("materialsContent.introBullet2")}</BulletPoint>
        <BulletPoint>{t("materialsContent.introBullet3")}</BulletPoint>
        <Paragraph>{t("materialsContent.introP4")}</Paragraph>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("materialsContent.part1Title")}
        icon={<Activity size={18} color={CyberpunkTheme.colors.neonPink} />}
        accentColor={CyberpunkTheme.colors.neonPink}
      >
        <SubHeader>{t("materialsContent.part1Sub1")}</SubHeader>
        <Paragraph>{t("materialsContent.part1P1")}</Paragraph>

        <SubHeader>{t("materialsContent.part1Sub2")}</SubHeader>
        <Paragraph>{t("materialsContent.part1P2")}</Paragraph>

        <SubHeader>{t("materialsContent.part1Sub3")}</SubHeader>
        <Paragraph>{t("materialsContent.part1P3")}</Paragraph>
        <FormulaBox>{t("materialsContent.part1Formula")}</FormulaBox>
        <Paragraph>{t("materialsContent.part1P4")}</Paragraph>

        <SubHeader>{t("materialsContent.part1Sub4")}</SubHeader>
        <Paragraph>{t("materialsContent.part1P5")}</Paragraph>

        <View style={styles.tableContainer}>
          <TableRow
            cells={[t("materialsContent.tableHeader1"), t("materialsContent.tableHeader2"), t("materialsContent.tableHeader3"), t("materialsContent.tableHeader4")]}
            isHeader
          />
          <TableRow cells={[t("materialsContent.tableRow1Col1"), "≥ 12,5%", "50", t("materialsContent.tableRow1Col4")]} />
          <TableRow cells={[t("materialsContent.tableRow2Col1"), "≥ 12,3%", "50", t("materialsContent.tableRow2Col4")]} />
          <TableRow cells={[t("materialsContent.tableRow3Col1"), "≥ 16,5%", "30", t("materialsContent.tableRow3Col4")]} />
          <TableRow cells={[t("materialsContent.tableRow4Col1"), "≥ 10,0%", "20", t("materialsContent.tableRow4Col4")]} />
        </View>

        <SubHeader>{t("materialsContent.part1Sub5")}</SubHeader>
        <Paragraph>{t("materialsContent.part1P6")}</Paragraph>
        <BulletPoint>{t("materialsContent.part1Bullet1")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part1Bullet2")}</BulletPoint>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("materialsContent.part2Title")}
        icon={<Heart size={18} color={CyberpunkTheme.colors.neonPurple} />}
        accentColor={CyberpunkTheme.colors.neonPurple}
      >
        <SubHeader>{t("materialsContent.part2Sub1")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P1")}</Paragraph>

        <SubHeader>{t("materialsContent.part2Sub2")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P2")}</Paragraph>
        <FormulaBox>{t("materialsContent.part2Formula1")}</FormulaBox>
        <Paragraph>{t("materialsContent.part2P3")}</Paragraph>

        <Paragraph>{t("materialsContent.part2P4")}</Paragraph>

        <SubHeader>{t("materialsContent.part2Sub3")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P5")}</Paragraph>
        <BulletPoint>{t("materialsContent.part2Bullet1")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet2")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet3")}</BulletPoint>
        <Paragraph>{t("materialsContent.part2P6")}</Paragraph>
        <Paragraph>{t("materialsContent.part2P7")}</Paragraph>

        <SubHeader>{t("materialsContent.part2Sub4")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P8")}</Paragraph>
        <FormulaBox>{t("materialsContent.part2Formula2")}</FormulaBox>
        <BulletPoint>{t("materialsContent.part2Bullet4")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet5")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet6")}</BulletPoint>
        <Paragraph>{t("materialsContent.part2P9")}</Paragraph>

        <SubHeader>{t("materialsContent.part2Sub5")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P10")}</Paragraph>
        <Paragraph>{t("materialsContent.part2P11")}</Paragraph>
        <BulletPoint>{t("materialsContent.part2Bullet7")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet8")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet9")}</BulletPoint>
        <Paragraph>{t("materialsContent.part2P12")}</Paragraph>

        <SubHeader>{t("materialsContent.part2Sub6")}</SubHeader>
        <Paragraph>{t("materialsContent.part2P13")}</Paragraph>
        <BulletPoint>{t("materialsContent.part2Bullet10")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet11")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet12")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part2Bullet13")}</BulletPoint>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("materialsContent.part3Title")}
        icon={<Wind size={18} color={CyberpunkTheme.colors.accent} />}
        accentColor={CyberpunkTheme.colors.accent}
      >
        <SubHeader>{t("materialsContent.part3Sub1")}</SubHeader>
        <Paragraph>{t("materialsContent.part3P1")}</Paragraph>

        <SubHeader>{t("materialsContent.part3Sub2")}</SubHeader>
        <Paragraph>{t("materialsContent.part3P2")}</Paragraph>

        <SubHeader>{t("materialsContent.part3Sub3")}</SubHeader>
        <BulletPoint>{t("materialsContent.part3Bullet1")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part3Bullet2")}</BulletPoint>
        <BulletPoint>{t("materialsContent.part3Bullet3")}</BulletPoint>

        <SubHeader>{t("materialsContent.part3Sub4")}</SubHeader>

        <View style={styles.tableContainer}>
          <TableRow cells={[t("materialsContent.part3TableH1"), t("materialsContent.part3TableH2"), t("materialsContent.part3TableH3")]} isHeader />
          <TableRow cells={["< 15%", t("materialsContent.part3Row1C2"), "< 7 ml/kg"]} />
          <TableRow cells={["15–44%", t("materialsContent.part3Row2C2"), "7–10 ml/kg"]} />
          <TableRow cells={["45–69%", t("materialsContent.part3Row3C2"), "11–14 ml/kg"]} />
          <TableRow cells={["≥ 70%", t("materialsContent.part3Row4C2"), "≥ 15 ml/kg"]} />
        </View>
        <Text style={styles.tableNote}>
          {t("materialsContent.part3Note")}
        </Text>
      </CollapsibleSection>

      <CollapsibleSection
        title={t("materialsContent.conclusionSectionTitle")}
        icon={<BookOpen size={18} color={CyberpunkTheme.colors.success} />}
        accentColor={CyberpunkTheme.colors.success}
      >
        <Paragraph>{t("materialsContent.conclusionP1")}</Paragraph>
        <Paragraph>{t("materialsContent.conclusionP2")}</Paragraph>
        <Paragraph>{t("materialsContent.conclusionP3")}</Paragraph>
      </CollapsibleSection>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
  },
  heroCard: {
    backgroundColor: CyberpunkTheme.colors.cardBackground,
    borderRadius: CyberpunkTheme.borderRadius.lg,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: CyberpunkTheme.colors.text,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
    lineHeight: 20,
  },
  paragraph: {
    fontSize: 14,
    color: CyberpunkTheme.colors.text,
    lineHeight: 22,
    marginBottom: 10,
  },
  subHeader: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    marginTop: 14,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 6,
    paddingRight: 8,
  },
  bulletDot: {
    fontSize: 14,
    color: CyberpunkTheme.colors.textSecondary,
    marginRight: 8,
    lineHeight: 22,
  },
  bulletText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.text,
    lineHeight: 22,
    flex: 1,
  },
  formulaBox: {
    backgroundColor: "rgba(167, 139, 250, 0.08)",
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.neonPurple,
    borderRadius: CyberpunkTheme.borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 10,
    alignItems: "center",
  },
  formulaText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: CyberpunkTheme.colors.neonPurple,
    textAlign: "center",
    lineHeight: 20,
  },
  tableContainer: {
    borderRadius: CyberpunkTheme.borderRadius.sm,
    borderWidth: 1,
    borderColor: CyberpunkTheme.colors.cardBorder,
    overflow: "hidden",
    marginVertical: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: CyberpunkTheme.colors.cardBorder,
  },
  tableHeaderRow: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  tableCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  tableCellFirst: {
    flex: 1.4,
  },
  tableCellText: {
    fontSize: 12,
    color: CyberpunkTheme.colors.text,
    lineHeight: 16,
  },
  tableHeaderText: {
    fontWeight: "700" as const,
    color: CyberpunkTheme.colors.neonCyan,
    fontSize: 11,
  },
  tableNote: {
    fontSize: 12,
    color: CyberpunkTheme.colors.textMuted,
    fontStyle: "italic" as const,
    marginTop: 4,
    marginBottom: 8,
  },
  bottomSpacer: {
    height: 40,
  },
});
