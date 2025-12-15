import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { Alert, Linking, Platform } from 'react-native';

/**
 * GPS Tracking Hook
 *
 * Handles location permissions and real-time tracking for active trips.
 * Integrates with the LocationDisclosureModal for Google Play compliance.
 *
 * IMPORTANT: Background location permission should only be requested AFTER
 * the user has accepted the prominent disclosure (LocationDisclosureModal).
 */
export const useGPSTracking = (tripId, driverId, isTracking = false, hasAcceptedDisclosure = false) => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hasForegroundPermission, setHasForegroundPermission] = useState(false);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(false);
  const [needsDisclosure, setNeedsDisclosure] = useState(false);
  const locationSubscription = useRef(null);
  const updateInterval = useRef(null);
  const isMounted = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Request foreground location permissions (can be done without disclosure)
  const requestForegroundPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (!isMounted.current) return false;

      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert(
          'Location Permission Required',
          'CCT Driver needs location access to track trips. Please enable location in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return false;
      }

      setHasForegroundPermission(true);
      return true;
    } catch (error) {
      console.error('Error requesting foreground location permission:', error);
      if (isMounted.current) {
        setErrorMsg('Failed to request location permission');
      }
      return false;
    }
  }, []);

  // Request background location permission (ONLY after disclosure acceptance)
  const requestBackgroundPermission = useCallback(async () => {
    if (!hasAcceptedDisclosure) {
      // User needs to accept disclosure first
      setNeedsDisclosure(true);
      return false;
    }

    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();

      if (!isMounted.current) return false;

      if (status !== 'granted') {
        Alert.alert(
          'Background Location Required',
          'For accurate trip tracking while using other apps, please enable "Allow all the time" location access in settings.',
          [
            { text: 'Skip', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return false;
      }

      setHasBackgroundPermission(true);
      setNeedsDisclosure(false);
      return true;
    } catch (error) {
      console.error('Error requesting background location permission:', error);
      if (isMounted.current) {
        setErrorMsg('Failed to request background location permission');
      }
      return false;
    }
  }, [hasAcceptedDisclosure]);

  // Initial foreground permission request
  useEffect(() => {
    const initializePermissions = async () => {
      try {
        // First check current permission status
        const { status: fgStatus } = await Location.getForegroundPermissionsAsync();

        if (!isMounted.current) return;

        if (fgStatus === 'granted') {
          setHasForegroundPermission(true);

          // Get initial location with error handling
          try {
            const initialLocation = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              timeout: 15000,
            });
            if (isMounted.current) {
              setLocation(initialLocation);
            }
          } catch (locError) {
            console.warn('Could not get initial location:', locError.message);
            // Don't set error - this is non-fatal
          }
        } else {
          // Request foreground permission
          await requestForegroundPermission();
        }

        // Check background permission status
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        if (bgStatus === 'granted' && isMounted.current) {
          setHasBackgroundPermission(true);
        }
      } catch (error) {
        console.error('Error initializing location permissions:', error);
        if (isMounted.current) {
          setErrorMsg('Failed to initialize location services');
        }
      }
    };

    initializePermissions();
  }, [requestForegroundPermission]);

  // Handle background permission when tracking starts
  useEffect(() => {
    if (isTracking && hasForegroundPermission && !hasBackgroundPermission) {
      if (hasAcceptedDisclosure) {
        requestBackgroundPermission();
      } else {
        setNeedsDisclosure(true);
      }
    }
  }, [isTracking, hasForegroundPermission, hasBackgroundPermission, hasAcceptedDisclosure, requestBackgroundPermission]);

  // Start tracking when permissions are granted and tracking is enabled
  useEffect(() => {
    if (!hasForegroundPermission || !isTracking || !tripId || !driverId) {
      return;
    }

    const startTracking = async () => {
      try {
        // Clean up existing subscription if any
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }

        // Subscribe to location updates
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 10, // Or when moved 10 meters
          },
          (newLocation) => {
            if (isMounted.current) {
              setLocation(newLocation);
            }
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
        if (isMounted.current) {
          setErrorMsg('Failed to start location tracking');
          Alert.alert(
            'Tracking Error',
            'Could not start location tracking. Please check your location settings and try again.',
            [{ text: 'OK' }]
          );
        }
      }
    };

    startTracking();

    // Cleanup function
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [hasForegroundPermission, isTracking, tripId, driverId]);

  // Send location updates to Supabase
  useEffect(() => {
    if (!location || !isTracking || !tripId || !driverId) {
      return;
    }

    const sendLocationUpdate = async () => {
      try {
        // Validate location data before sending
        if (!location.coords ||
            typeof location.coords.latitude !== 'number' ||
            typeof location.coords.longitude !== 'number') {
          console.warn('Invalid location data, skipping update');
          return;
        }

        const { error } = await supabase.from('driver_location').insert({
          trip_id: tripId,
          driver_id: driverId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading ?? null,
          speed: location.coords.speed ?? null,
          timestamp: new Date(location.timestamp).toISOString(),
        });

        if (error) {
          console.error('Error saving location:', error);
        }
      } catch (error) {
        console.error('Error sending location update:', error);
        // Don't alert user for every failed update - just log it
      }
    };

    sendLocationUpdate();
  }, [location, isTracking, tripId, driverId]);

  const stopTracking = useCallback(() => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (updateInterval.current) {
      clearInterval(updateInterval.current);
      updateInterval.current = null;
    }
  }, []);

  return {
    location,
    errorMsg,
    hasPermission: hasForegroundPermission,
    hasForegroundPermission,
    hasBackgroundPermission,
    needsDisclosure,
    stopTracking,
    requestForegroundPermission,
    requestBackgroundPermission,
  };
};
