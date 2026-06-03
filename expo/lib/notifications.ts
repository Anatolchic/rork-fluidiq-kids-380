import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import supabase from './supabase';
import { registerWebPush } from './web-push';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) await registerWebPush(userId);
    return null;
  }
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); final = status; }
  if (final !== 'granted') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0,250,250,250], lightColor: '#6C63FF' });
  }
  return (await Notifications.getExpoPushTokenAsync()).data;
}

export async function savePushToken(userId: string, token: string) {
  await supabase.from('push_tokens').upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'user_id' });
}
