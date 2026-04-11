import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { CyberpunkTheme } from "@/constants/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Ошибка" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Эта страница не существует</Text>

        <Link href="/(tabs)/patients" style={styles.link}>
          <Text style={styles.linkText}>Вернуться на главную</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: CyberpunkTheme.colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: CyberpunkTheme.colors.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: CyberpunkTheme.colors.neonCyan,
  },
});
