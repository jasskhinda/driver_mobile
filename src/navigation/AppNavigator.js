import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import TripsScreen from '../screens/TripsScreen';
import TripDetailsScreen from '../screens/TripDetailsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ClockScreen from '../screens/ClockScreen';
import VehicleInspectionScreen from '../screens/VehicleInspectionScreen';
import ShiftHistoryScreen from '../screens/ShiftHistoryScreen';
import { useAuth, AuthProvider } from '../hooks/useAuth';
import { ShiftProvider } from '../contexts/ShiftContext';
import { ActivityIndicator, View, Platform } from 'react-native';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const BRAND_COLOR = '#5fbfc0';

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Clock') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Trips') {
            iconName = focused ? 'car' : 'car-outline';
          } else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: BRAND_COLOR,
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          height: Platform.OS === 'ios' ? 85 : 70,
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 5,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Clock" component={ClockScreen} />
      <Tab.Screen name="Trips" component={TripsScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Navigation() {
  const authContext = useAuth();
  const user = authContext?.user;
  const isLoading = Boolean(authContext?.loading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5fbfc0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="TripDetails" component={TripDetailsScreen} />
            <Stack.Screen
              name="VehicleInspection"
              component={VehicleInspectionScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ShiftHistory"
              component={ShiftHistoryScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <AuthProvider>
      <ShiftProvider>
        <Navigation />
      </ShiftProvider>
    </AuthProvider>
  );
}
