import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Защита от зависания SecureStore на iOS (deadlock при первом обращении к Keychain)
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
const STORE_TIMEOUT = 3000;

const SESSION_KEY = "repetitory_bio_session_v2";
const ENABLED_KEY = "repetitory_bio_enabled_v2";
const PROMPTED_KEY = "repetitory_bio_prompted_v2";
const PROMPTED_USER_PREFIX = "repetitory_bio_prompted_u_";

function promptedUserKey(userId: string): string {
  return `${PROMPTED_USER_PREFIX}${userId}`;
}
const CREDENTIALS_KEY = "repetitory_bio_credentials_v1";

export type BiometricSession = {
  accessToken: string;
  refreshToken: string;
};

export type BiometricCredentials = {
  email: string;
  password: string;
};

export type BiometricKind = "face" | "fingerprint" | "iris" | null;

export async function getBiometricKind(): Promise<BiometricKind> {
  if (Platform.OS === "web") return null;
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
    return null;
  } catch (e) {
    console.log("[biometric] get kind error", e);
    return null;
  }
}

async function hasBiometricHardware(): Promise<boolean> {
  // hasHardwareAsync на iOS иногда возвращает false при первом запуске после
  // установки (race с инициализацией LocalAuthentication framework). Если так —
  // fallback на supportedAuthenticationTypesAsync: если оно вернуло хоть один
  // тип — значит hardware есть. Это закрывает кейс «биометрия писало не
  // доступно, хотя реально есть» на некоторых устройствах.
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    if (hw) return true;
  } catch (e) {
    console.log("[biometric] hasHardwareAsync threw", e);
  }
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return Array.isArray(types) && types.length > 0;
  } catch (e) {
    console.log("[biometric] supportedAuthenticationTypesAsync threw", e);
    return false;
  }
}

export async function isBiometricSupported(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hw = await hasBiometricHardware();
    if (!hw) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (e) {
    console.log("[biometric] support check error", e);
    return false;
  }
}

export type BiometricSupportStatus =
  | { ok: true }
  | { ok: false; reason: "web"; message: string }
  | { ok: false; reason: "no-hardware"; message: string }
  | { ok: false; reason: "not-enrolled"; message: string }
  | { ok: false; reason: "check-error"; message: string };

/**
 * Подробная диагностика — что именно не так с биометрией на устройстве.
 * Возвращает не просто false, а конкретную причину и текст для пользователя,
 * чтобы он понимал что делать ("настройте Face ID в Настройках" vs
 * "ваше устройство не поддерживает биометрию").
 */
export async function getBiometricSupportStatus(): Promise<BiometricSupportStatus> {
  if (Platform.OS === "web") {
    return { ok: false, reason: "web", message: "Биометрия недоступна в браузере." };
  }
  try {
    // hasBiometricHardware с fallback на supportedAuthenticationTypes —
    // см. комментарий в hasBiometricHardware. На некоторых устройствах
    // hasHardwareAsync даёт false при наличии Face ID.
    const hw = await hasBiometricHardware();
    if (!hw) {
      return {
        ok: false,
        reason: "no-hardware",
        message: "Это устройство не поддерживает Face ID / Touch ID.",
      };
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return {
        ok: false,
        reason: "not-enrolled",
        message:
          Platform.OS === "ios"
            ? "На устройстве не настроен Face ID / Touch ID. Откройте «Настройки» → «Face ID и код-пароль» и добавьте лицо или отпечаток."
            : "На устройстве не настроена биометрия. Откройте «Настройки» → «Безопасность» → «Отпечаток пальца» и добавьте отпечаток.",
      };
    }
    return { ok: true };
  } catch (e) {
    console.log("[biometric] support check error", e);
    return {
      ok: false,
      reason: "check-error",
      message: "Не удалось проверить биометрию на устройстве. Попробуйте перезапустить приложение.",
    };
  }
}

export type AuthResult = { success: boolean; error?: string };

export async function authenticate(
  reason: string = "Войти в Репетиторы",
  options?: { disableDeviceFallback?: boolean }
): Promise<AuthResult> {
  if (Platform.OS === "web") return { success: false, error: "Недоступно в браузере" };
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    if (!hw) return { success: false, error: "Устройство не поддерживает биометрию" };
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled)
      return {
        success: false,
        error:
          "На устройстве не настроены Face ID / Touch ID. Добавьте их в настройках устройства и попробуйте снова.",
      };
    const disableDeviceFallback = options?.disableDeviceFallback ?? false;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Отмена",
      disableDeviceFallback,
      fallbackLabel: disableDeviceFallback ? "" : "Использовать код",
    });
    if (res.success) return { success: true };
    const code = (res as { error?: string }).error;
    const map: Record<string, string> = {
      user_cancel: "Отменено",
      system_cancel: "Отменено системой",
      app_cancel: "Приложение отменило запрос",
      user_fallback: "Отменено",
      lockout: "Слишком много попыток. Разблокируйте устройство и попробуйте снова.",
      not_available: Platform.OS === "ios"
        ? "Face ID недоступен. Откройте Настройки → Рестики → Face ID и включите доступ."
        : "Биометрия недоступна на этом устройстве.",
      not_enrolled: "Face ID / Touch ID не настроены. Добавьте их в Настройки → Face ID и код-пароль.",
      passcode_not_set: "На устройстве не задан код-пароль. Добавьте его в Настройках.",
    };
    return { success: false, error: code ? map[code] ?? code : "Не удалось подтвердить биометрию" };
  } catch (e) {
    console.log("[biometric] auth error", e);
    const message = e instanceof Error ? e.message : "Ошибка биометрии";
    return { success: false, error: message };
  }
}

export async function saveSessionTokens(session: BiometricSession): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)), STORE_TIMEOUT, undefined as any);
    await withTimeout(SecureStore.setItemAsync(ENABLED_KEY, "1"), STORE_TIMEOUT, undefined as any);
  } catch (e) {
    console.log("[biometric] save session error", e);
  }
}

export async function getSessionTokens(): Promise<BiometricSession | null> {
  try {
    const raw = await withTimeout(SecureStore.getItemAsync(SESSION_KEY), STORE_TIMEOUT, null);
    return raw ? (JSON.parse(raw) as BiometricSession) : null;
  } catch (e) {
    console.log("[biometric] get session error", e);
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(ENABLED_KEY);
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch (e) {
    console.log("[biometric] clear error", e);
  }
}

/**
 * Сохраняем email/пароль в SecureStore (Keychain на iOS, EncryptedSharedPreferences на Android).
 * Это резервный канал входа по биометрии: если refresh-токен Supabase оказался устаревшим
 * после ротации/выхода, мы заново выполняем signInWithPassword и получаем свежую сессию.
 */
export async function saveCredentials(creds: BiometricCredentials): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(creds)), STORE_TIMEOUT, undefined as any);
  } catch (e) {
    console.log("[biometric] save credentials error", e);
  }
}

export async function getCredentials(): Promise<BiometricCredentials | null> {
  try {
    const raw = await withTimeout(SecureStore.getItemAsync(CREDENTIALS_KEY), STORE_TIMEOUT, null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricCredentials;
    if (!parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch (e) {
    console.log("[biometric] get credentials error", e);
    return null;
  }
}

export async function clearStoredCredentialsOnly(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch (e) {
    console.log("[biometric] clear credentials-only error", e);
  }
}

export async function clearSessionOnly(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (e) {
    console.log("[biometric] clear session-only error", e);
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const v = await withTimeout(SecureStore.getItemAsync(ENABLED_KEY), STORE_TIMEOUT, null);
    return v === "1";
  } catch {
    return false;
  }
}

/**
 * Был ли пользователь спрошен про биометрию.
 * Если userId передан — проверяем per-user ключ (это даёт каждому новому
 * аккаунту собственное «первое уведомление»).
 * Глобальный ключ оставлен для обратной совместимости со старыми установками,
 * но больше не блокирует показ нового пользователя на том же устройстве.
 */
export async function wasBiometricPrompted(userId?: string | null): Promise<boolean> {
  try {
    if (userId) {
      const u = await withTimeout(SecureStore.getItemAsync(promptedUserKey(userId)), STORE_TIMEOUT, null);
      return u === "1";
    }
    const v = await withTimeout(SecureStore.getItemAsync(PROMPTED_KEY), STORE_TIMEOUT, null);
    return v === "1";
  } catch {
    return false;
  }
}

export async function setBiometricPrompted(userId?: string | null): Promise<void> {
  try {
    if (userId) {
      await withTimeout(SecureStore.setItemAsync(promptedUserKey(userId), "1"), STORE_TIMEOUT, undefined as never);
    }
    await withTimeout(SecureStore.setItemAsync(PROMPTED_KEY, "1"), STORE_TIMEOUT, undefined as never);
  } catch (e) {
    console.log("[biometric] set prompted error", e);
  }
}

export async function clearBiometricPrompted(userId?: string | null): Promise<void> {
  try {
    if (userId) {
      await withTimeout(SecureStore.deleteItemAsync(promptedUserKey(userId)), STORE_TIMEOUT, undefined as never);
    }
    await withTimeout(SecureStore.deleteItemAsync(PROMPTED_KEY), STORE_TIMEOUT, undefined as never);
  } catch (e) {
    console.log("[biometric] clear prompted error", e);
  }
}
