import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment variables to prevent crashes
if (!supabaseUrl || supabaseUrl === 'undefined' || supabaseUrl === '') {
  console.error(
    'EXPO_PUBLIC_SUPABASE_URL is not configured. ' +
    'Please add it to your .env file or app.config.js'
  );
}

if (!supabaseAnonKey || supabaseAnonKey === 'undefined' || supabaseAnonKey === '') {
  console.error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured. ' +
    'Please add it to your .env file or app.config.js'
  );
}

// Custom storage adapter for React Native
const ExpoSecureStoreAdapter = {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },
};

// Create a dummy client if environment variables are missing
// This prevents crashes during development or misconfiguration
let supabase;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
} else {
  // Create a placeholder that will log errors instead of crashing
  console.error('Supabase client not initialized due to missing configuration');
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: new Error('Supabase not configured') }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
      signOut: async () => ({ error: new Error('Supabase not configured') }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error('Supabase not configured') }) }) }),
      insert: async () => ({ error: new Error('Supabase not configured') }),
      update: () => ({ eq: async () => ({ error: new Error('Supabase not configured') }) }),
    }),
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    }),
  };
}

export { supabase };
