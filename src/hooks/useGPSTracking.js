import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

export const useGPSTracking = (tripId, driverId, isTracking = false) => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const locationSubscription = useRef(null);
  const updateInterval = useRef(null);

  // Request location permissions
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          Alert.alert(
            'Location Permission Required',
            'Please enable location access to track trips.',
            [{ text: 'OK' }]
          );
          return;
        }

        // Request background location permission for active trips
        if (isTracking) {
          let { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus !== 'granted') {
            Alert.alert(
              'Background Location Needed',
              'For accurate trip tracking, please enable "Always Allow" location access in settings.',
              [{ text: 'OK' }]
            );
          }
        }

        setHasPermission(true);

        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(initialLocation);
      } catch (error) {
        console.error('Error requesting location permissions:', error);
        setErrorMsg('Failed to get location permissions');
      }
    })();
  }, [isTracking]);

  // Start tracking
  useEffect(() => {
    if (!hasPermission || !isTracking || !tripId || !driverId) {
      return;
    }

    const startTracking = async () => {
      try {
        // Subscribe to location updates
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 10, // Or when moved 10 meters
          },
          (newLocation) => {
            setLocation(newLocation);
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
        setErrorMsg('Failed to start location tracking');
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
  }, [hasPermission, isTracking, tripId, driverId]);

  // Send location updates to Supabase
  useEffect(() => {
    if (!location || !isTracking || !tripId || !driverId) {
      return;
    }

    const sendLocationUpdate = async () => {
      try {
        const { error } = await supabase.from('driver_location').insert({
          trip_id: tripId,
          driver_id: driverId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          heading: location.coords.heading || null,
          speed: location.coords.speed || null,
          timestamp: new Date(location.timestamp).toISOString(),
        });

        if (error) {
          console.error('Error saving location:', error);
        }
      } catch (error) {
        console.error('Error sending location update:', error);
      }
    };

    sendLocationUpdate();
  }, [location, isTracking, tripId, driverId]);

  const stopTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (updateInterval.current) {
      clearInterval(updateInterval.current);
      updateInterval.current = null;
    }
  };

  return {
    location,
    errorMsg,
    hasPermission,
    stopTracking,
  };
};
