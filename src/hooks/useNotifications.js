import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  scheduleLocalNotification,
  getDriverNotificationMessage,
  saveNotificationToHistory,
  initializeOneSignal,
  loginOneSignal,
  logoutOneSignal,
} from '../services/notifications';

// Initialize OneSignal when module loads
initializeOneSignal();

export function useNotifications(userId) {
  const notificationListener = useRef();
  const responseListener = useRef();
  const notificationSubscription = useRef(null);

  useEffect(() => {
    console.log('useNotifications hook called with userId:', userId);

    if (!userId) {
      console.log('Missing userId, not setting up notifications');
      // Logout from OneSignal when user logs out
      logoutOneSignal();
      return;
    }

    console.log('Setting up notifications for driver:', userId);

    // Login to OneSignal with user ID
    loginOneSignal(userId);

    // Register for push notifications
    registerPushNotifications();

    // Set up notification listeners
    setupNotificationListeners();

    // Set up real-time notification monitoring
    setupNotificationMonitoring();

    // Cleanup
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (notificationSubscription.current) {
        notificationSubscription.current.unsubscribe();
      }
    };
  }, [userId]);

  const registerPushNotifications = async () => {
    try {
      console.log('Registering push notifications...');

      const token = await registerForPushNotificationsAsync();
      console.log('Push token received:', token);

      // Only save non-OneSignal tokens to database (for backwards compatibility)
      if (token && token !== 'LOCAL_NOTIFICATIONS_ONLY' && token !== 'ONESIGNAL_MANAGED') {
        await savePushToken(userId, token);
        console.log('Push token saved to database');
      } else if (token === 'ONESIGNAL_MANAGED') {
        console.log('Push notifications managed by OneSignal');
      } else {
        console.log('No push token received - local notifications will still work');
      }
    } catch (error) {
      console.error('Error registering push notifications:', error);
    }
  };

  const setupNotificationListeners = () => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📬 Notification received while app is open:', notification);
    });

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 User tapped notification:', response);
      const data = response.notification.request.content.data;

      // Navigate to trip detail if tripId exists
      if (data?.tripId) {
        console.log('📍 Navigating to trip:', data.tripId);
        // Note: Navigation will be handled by the app's navigation system
      }
    });
  };

  const setupNotificationMonitoring = async () => {
    try {
      console.log(`🔍 Setting up notification monitoring for driver: ${userId}`);
      console.log(`🔍 Channel name will be: driver-notifications-${userId}`);
      console.log(`🔍 Listening for INSERTs on notifications where user_id=eq.${userId} and app_type=driver`);

      // Subscribe to new notifications being inserted into notifications table
      const channel = supabase
        .channel(`driver-notifications-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          async (payload) => {
            console.log('🔔 New notification received via Supabase real-time:', payload);

            const notification = payload.new;

            // Only process driver app notifications
            if (notification.app_type !== 'driver') {
              console.log('⏭️ Skipping non-driver notification');
              return;
            }

            console.log('📋 Notification details:', {
              title: notification.title,
              body: notification.body,
              data: notification.data,
              app_type: notification.app_type,
              notification_type: notification.notification_type
            });

            // Show local notification
            try {
              await scheduleLocalNotification(
                notification.title,
                notification.body,
                notification.data
              );
              console.log('✅ Local notification scheduled successfully');
            } catch (error) {
              console.error('❌ Failed to show local notification:', error);
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Notification subscription status:', status);

          if (status === 'SUBSCRIBED') {
            console.log('✅ Notification monitoring ACTIVE - you will receive push notifications');
          } else if (status === 'CHANNEL_ERROR') {
            console.log('❌ Subscription CHANNEL_ERROR - will auto-reconnect');
          } else if (status === 'TIMED_OUT') {
            console.log('⏱️ Subscription TIMED OUT - reconnecting...');
            if (notificationSubscription.current) {
              notificationSubscription.current.unsubscribe();
            }
            setTimeout(() => setupNotificationMonitoring(), 2000);
          } else if (status === 'CLOSED') {
            console.log('🔒 Subscription CLOSED');
          }
        });

      notificationSubscription.current = channel;
      console.log('✅ Notification monitoring subscription created');
    } catch (error) {
      console.error('❌ Error setting up notification monitoring:', error);
    }
  };
}
