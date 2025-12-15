import React from 'react';
import 'react-native-url-polyfill/auto';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { useNotifications } from './src/hooks/useNotifications';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

// Component that uses auth context to get user and enable notifications
function AppContent() {
  const { user } = useAuth();

  // Enable notifications when user is logged in
  useNotifications(user?.id);

  return <AppNavigator />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
