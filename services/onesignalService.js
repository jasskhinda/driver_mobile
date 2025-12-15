import { OneSignal } from 'react-native-onesignal';
import Constants from 'expo-constants';

class OneSignalService {
  constructor() {
    this.isInitialized = false;
    this.initializationError = null;
  }

  initialize() {
    // Prevent multiple initializations
    if (this.isInitialized) {
      console.log('OneSignal already initialized');
      return true;
    }

    try {
      const oneSignalAppId = Constants.expoConfig?.extra?.oneSignalAppId;

      if (!oneSignalAppId || oneSignalAppId === 'DRIVER_ONESIGNAL_APP_ID_PLACEHOLDER') {
        console.warn('OneSignal App ID not configured - push notifications will not work');
        this.initializationError = 'App ID not configured';
        return false;
      }

      console.log('Initializing OneSignal with App ID:', oneSignalAppId);

      // SDK 5.x initialization
      OneSignal.initialize(oneSignalAppId);
      this.isInitialized = true;

      // Request notification permissions (wrapped in try-catch)
      this.requestPermission();

      // Set up notification handlers
      this.setupNotificationHandlers();

      return true;
    } catch (error) {
      console.error('Failed to initialize OneSignal:', error);
      this.initializationError = error.message;
      this.isInitialized = false;
      return false;
    }
  }

  requestPermission() {
    if (!this.isInitialized) {
      console.warn('Cannot request permission: OneSignal not initialized');
      return;
    }

    try {
      OneSignal.Notifications.requestPermission(true);
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    }
  }

  setupNotificationHandlers() {
    if (!this.isInitialized) {
      return;
    }

    try {
      OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
        console.log('OneSignal: notification will show in foreground:', event);
        event.preventDefault();
        event.getNotification().display();
      });

      OneSignal.Notifications.addEventListener('click', (event) => {
        console.log('OneSignal: notification clicked:', event);
      });
    } catch (error) {
      console.error('Failed to set up notification handlers:', error);
    }
  }

  async login(userId) {
    if (!this.isInitialized) {
      console.warn('Cannot login: OneSignal not initialized');
      return;
    }

    if (!userId) {
      console.error('Cannot login: userId is required');
      return;
    }

    try {
      console.log('OneSignal login with user ID:', userId);
      OneSignal.login(userId);

      // Log the OneSignal ID for debugging
      setTimeout(async () => {
        try {
          const onesignalId = await OneSignal.User.getOnesignalId();
          const externalId = await OneSignal.User.getExternalId();
          console.log('✅ OneSignal User ID:', onesignalId);
          console.log('✅ OneSignal External ID:', externalId);

          if (onesignalId) {
            console.log('🔔 Push notifications should be working!');
          } else {
            console.warn('⚠️ OneSignal ID is null - push may not work');
          }
        } catch (e) {
          console.log('Could not get OneSignal IDs:', e.message);
        }
      }, 2000);
    } catch (error) {
      console.error('OneSignal login failed:', error);
    }
  }

  logout() {
    if (!this.isInitialized) {
      console.warn('Cannot logout: OneSignal not initialized');
      return;
    }

    try {
      console.log('OneSignal logout');
      OneSignal.logout();
    } catch (error) {
      console.error('OneSignal logout failed:', error);
    }
  }

  async getPlayerId() {
    if (!this.isInitialized) {
      console.warn('Cannot get player ID: OneSignal not initialized');
      return null;
    }

    try {
      const onesignalId = await OneSignal.User.getOnesignalId();
      return onesignalId;
    } catch (error) {
      console.error('Error getting OneSignal ID:', error);
      return null;
    }
  }

  addTags(tags) {
    if (!this.isInitialized) {
      console.warn('Cannot add tags: OneSignal not initialized');
      return;
    }

    if (!tags || typeof tags !== 'object') {
      console.error('Cannot add tags: tags must be an object');
      return;
    }

    try {
      console.log('Adding OneSignal tags:', tags);
      OneSignal.User.addTags(tags);
    } catch (error) {
      console.error('Failed to add OneSignal tags:', error);
    }
  }

  async setBadgeCount(count) {
    if (!this.isInitialized) {
      console.warn('Cannot set badge count: OneSignal not initialized');
      return;
    }

    try {
      OneSignal.Notifications.clearAll();
      console.log('Cleared notifications, badge count:', count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Utility method to check initialization status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      error: this.initializationError,
    };
  }
}

export default new OneSignalService();
