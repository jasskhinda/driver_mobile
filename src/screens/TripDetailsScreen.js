import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useLocationDisclosure } from '../hooks/useLocationDisclosure';
import LocationDisclosureModal from '../components/LocationDisclosureModal';
import CarMarker from '../components/CarMarker';

const BRAND_COLOR = '#5fbfc0';
const GOOGLE_MAPS_API_KEY = 'AIzaSyDylwCsypHOs6T9e-JnTA7AoqOMrc3hbhE';
const DISPATCHER_APP_URL = 'https://dispatch.compassionatecaretransportation.com';
const { width, height } = Dimensions.get('window');

// Helper function to send push notification to dispatchers when driver takes action
async function notifyDispatcher(tripId, action, tripDetails = {}) {
  try {
    console.log('📤 Sending dispatcher notification:', { tripId, action });
    const response = await fetch(`${DISPATCHER_APP_URL}/api/notifications/send-dispatcher-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripId,
        action,
        source: 'driver_app',
        tripDetails,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Dispatcher notification sent:', result);
    } else {
      console.error('❌ Failed to send dispatcher notification:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending dispatcher notification:', error);
  }
}

export default function TripDetailsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [routeInfo, setRouteInfo] = useState({ distance: null, duration: null });
  const mapRef = useRef(null);

  // Trip phase: 'waiting' | 'en_route_to_pickup' | 'arrived_at_pickup' | 'en_route_to_destination'
  const [tripPhase, setTripPhase] = useState('waiting');

  // Location disclosure management (for Google Play compliance)
  const {
    hasAcceptedDisclosure,
    isLoading: disclosureLoading,
    acceptDisclosure,
  } = useLocationDisclosure();
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);

  // Enable GPS tracking when trip is in_progress
  const isTracking = trip?.status === 'in_progress' && trip?.driver_id === user?.id;
  const {
    location,
    hasPermission,
    needsDisclosure,
    requestBackgroundPermission,
  } = useGPSTracking(tripId, user?.id, isTracking, hasAcceptedDisclosure);

  // Show disclosure modal when needed (triggered by GPS tracking hook)
  useEffect(() => {
    if (needsDisclosure && !hasAcceptedDisclosure && !disclosureLoading) {
      setShowDisclosureModal(true);
    }
  }, [needsDisclosure, hasAcceptedDisclosure, disclosureLoading]);

  // Handle disclosure acceptance
  const handleDisclosureAccept = async () => {
    const success = await acceptDisclosure();
    setShowDisclosureModal(false);
    if (success) {
      // Now that disclosure is accepted, request the permission
      requestBackgroundPermission();
    }
  };

  // Handle disclosure decline
  const handleDisclosureDecline = () => {
    setShowDisclosureModal(false);
    Alert.alert(
      'Location Access Required',
      'Background location is needed for trip tracking. You can enable it later from the trip screen.',
      [{ text: 'OK' }]
    );
  };

  // Determine current navigation target based on phase
  const currentTarget = tripPhase === 'en_route_to_destination' ? destinationCoords : pickupCoords;
  const currentTargetLabel = tripPhase === 'en_route_to_destination' ? 'Destination' : 'Pickup';

  useEffect(() => {
    fetchTripDetails();

    const subscription = supabase
      .channel(`trip_${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`,
        },
        (payload) => {
          setTrip(prev => ({ ...prev, ...payload.new }));
          // Update phase based on trip_phase column
          if (payload.new.trip_phase) {
            setTripPhase(payload.new.trip_phase);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [tripId]);

  const fetchTripDetails = async () => {
    try {
      const { data: tripData, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

      if (error) throw error;

      // Enrich trip with related data
      const enrichedTrip = { ...tripData };

      // Set initial trip phase
      if (tripData.trip_phase) {
        setTripPhase(tripData.trip_phase);
      } else if (tripData.status === 'in_progress') {
        setTripPhase('en_route_to_pickup');
      }

      // Fetch facility managed client data
      if (tripData.managed_client_id) {
        const { data: clientData } = await supabase
          .from('facility_managed_clients')
          .select('first_name, last_name, phone_number')
          .eq('id', tripData.managed_client_id)
          .single();
        if (clientData) enrichedTrip.facility_managed_clients = clientData;
      }

      // Fetch individual user profile data
      if (tripData.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, phone_number')
          .eq('id', tripData.user_id)
          .single();
        if (profileData) enrichedTrip.profiles = profileData;
      }

      // Fetch driver data
      if (tripData.driver_id) {
        const { data: driverData } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, phone_number')
          .eq('id', tripData.driver_id)
          .single();
        if (driverData) enrichedTrip.driver = driverData;
      }

      setTrip(enrichedTrip);

      // Geocode addresses to coordinates for map display
      if (enrichedTrip.pickup_address) {
        geocodeAddress(enrichedTrip.pickup_address, setPickupCoords);
      }
      if (enrichedTrip.destination_address) {
        geocodeAddress(enrichedTrip.destination_address, setDestinationCoords);
      }
    } catch (error) {
      console.error('Error fetching trip:', error);
      Alert.alert('Error', 'Failed to load trip details');
    } finally {
      setLoading(false);
    }
  };

  const geocodeAddress = async (address, setCoords) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        setCoords({ latitude: lat, longitude: lng });
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    }
  };

  // Fit map to show route
  useEffect(() => {
    if (mapRef.current && location && currentTarget) {
      const driverCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // If going to destination, include pickup too for context
      const coordinates = tripPhase === 'en_route_to_destination'
        ? [driverCoords, destinationCoords, pickupCoords].filter(Boolean)
        : [driverCoords, pickupCoords].filter(Boolean);

      if (coordinates.length >= 2) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 60, bottom: 200, left: 60 },
            animated: true,
          });
        }, 500);
      }
    }
  }, [location, tripPhase, pickupCoords, destinationCoords]);

  const acceptTrip = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          driver_id: user.id,
          driver_acceptance_status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      if (error) throw error;

      Alert.alert('Success', 'Trip accepted successfully!');
      fetchTripDetails();

      notifyDispatcher(tripId, 'driver_accepted', {
        pickup_address: trip?.pickup_address,
        driverName: user?.email,
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const startTrip = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          status: 'in_progress',
          driver_acceptance_status: 'started',
          trip_phase: 'en_route_to_pickup',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      if (error) throw error;

      setTripPhase('en_route_to_pickup');
      Alert.alert('Success', 'Trip started! Navigate to pickup location.');
      fetchTripDetails();

      notifyDispatcher(tripId, 'trip_started', {
        pickup_address: trip?.pickup_address,
        driverName: user?.email,
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const arrivedAtPickup = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          trip_phase: 'arrived_at_pickup',
          pickup_arrival_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      if (error) throw error;

      setTripPhase('arrived_at_pickup');
      Alert.alert('Arrived!', 'Waiting for passenger. Tap "Start Ride" when ready.');

      notifyDispatcher(tripId, 'arrived_at_pickup', {
        pickup_address: trip?.pickup_address,
        driverName: user?.email,
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const startRide = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          trip_phase: 'en_route_to_destination',
          ride_start_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      if (error) throw error;

      setTripPhase('en_route_to_destination');
      Alert.alert('Ride Started!', 'Navigate to destination.');

      notifyDispatcher(tripId, 'ride_started', {
        destination_address: trip?.destination_address,
        driverName: user?.email,
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const completeTrip = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('trips')
        .update({
          status: 'completed',
          driver_acceptance_status: 'completed',
          trip_phase: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      if (error) throw error;

      Alert.alert('Trip Completed!', 'Great job!');

      notifyDispatcher(tripId, 'trip_completed', {
        pickup_address: trip?.pickup_address,
        driverName: user?.email,
      });

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openNavigation = () => {
    const address = tripPhase === 'en_route_to_destination'
      ? trip?.destination_address
      : trip?.pickup_address;

    if (address) {
      const url = `https://maps.google.com/?daddr=${encodeURIComponent(address)}`;
      Linking.openURL(url);
    }
  };

  const getClientInfo = () => {
    if (trip?.facility_managed_clients) {
      const { first_name, last_name, phone_number } = trip.facility_managed_clients;
      return {
        name: `${first_name} ${last_name}`,
        phone: phone_number,
      };
    }
    if (trip?.profiles) {
      const { first_name, last_name, email, phone_number } = trip.profiles;
      return {
        name: `${first_name || ''} ${last_name || ''}`.trim() || email,
        phone: phone_number,
      };
    }
    return { name: 'Unknown Client', phone: null };
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'TBD';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Trip not found</Text>
      </View>
    );
  }

  const client = getClientInfo();
  const canAccept = trip.assigned_driver_id === user.id &&
                    !trip.driver_id &&
                    (trip.driver_acceptance_status === 'assigned_waiting' ||
                     !trip.driver_acceptance_status);
  const canStart = trip.driver_id === user.id &&
                   (trip.driver_acceptance_status === 'accepted' ||
                    (!trip.driver_acceptance_status && trip.status === 'upcoming')) &&
                   trip.status !== 'in_progress';
  const isInProgress = trip.status === 'in_progress' && trip.driver_id === user.id;

  const getStatusColor = (status) => {
    switch (status) {
      case 'assigned': return '#3B82F6';
      case 'in_progress': return '#F59E0B';
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getPhaseInfo = () => {
    switch (tripPhase) {
      case 'en_route_to_pickup':
        return { label: 'Navigating to Pickup', color: '#3B82F6', icon: 'navigate' };
      case 'arrived_at_pickup':
        return { label: 'Waiting for Passenger', color: '#F59E0B', icon: 'time' };
      case 'en_route_to_destination':
        return { label: 'Heading to Destination', color: '#10B981', icon: 'car' };
      default:
        return { label: 'Ready', color: '#6B7280', icon: 'checkmark-circle' };
    }
  };

  const phaseInfo = getPhaseInfo();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Location Disclosure Modal - Required for Google Play compliance */}
      <LocationDisclosureModal
        visible={showDisclosureModal}
        onAccept={handleDisclosureAccept}
        onDecline={handleDisclosureDecline}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Map View - Full screen when in progress */}
      {isInProgress && location && currentTarget ? (
        <View style={styles.fullMapContainer}>
          <MapView
            ref={mapRef}
            style={styles.fullMap}
            provider={PROVIDER_GOOGLE}
            showsUserLocation={false}
            showsMyLocationButton={false}
            loadingEnabled={true}
          >
            {/* Driver Location - Uber Style Car */}
            <Marker
              coordinate={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={location.coords.heading || 0}
              flat={true}
            >
              <CarMarker size={56} color={BRAND_COLOR} />
            </Marker>

            {/* Pickup Marker */}
            {pickupCoords && (
              <Marker
                coordinate={pickupCoords}
                title="Pickup"
                description={trip.pickup_address}
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.markerDot, { backgroundColor: '#10B981' }]}>
                    <Ionicons name="location" size={20} color="#fff" />
                  </View>
                  <Text style={styles.markerLabel}>PICKUP</Text>
                </View>
              </Marker>
            )}

            {/* Destination Marker */}
            {destinationCoords && (
              <Marker
                coordinate={destinationCoords}
                title="Destination"
                description={trip.destination_address}
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.markerDot, { backgroundColor: '#EF4444' }]}>
                    <Ionicons name="flag" size={20} color="#fff" />
                  </View>
                  <Text style={styles.markerLabel}>DROP-OFF</Text>
                </View>
              </Marker>
            )}

            {/* Route 1: Driver to Pickup (Blue - Only show when heading to pickup) */}
            {/* Rendered FIRST so green route appears on top where they overlap */}
            {tripPhase === 'en_route_to_pickup' && pickupCoords && (
              <MapViewDirections
                origin={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                }}
                destination={pickupCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={6}
                strokeColor="#2563EB"
                optimizeWaypoints={true}
                onReady={(result) => {
                  setRouteInfo({
                    distance: result.distance,
                    duration: result.duration,
                  });
                }}
              />
            )}

            {/* Route 2: Pickup to Destination (Green - The booked route that never changes) */}
            {/* Rendered SECOND so it appears on top */}
            {pickupCoords && destinationCoords && (
              <MapViewDirections
                origin={pickupCoords}
                destination={destinationCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={6}
                strokeColor="#22C55E"
                optimizeWaypoints={true}
              />
            )}

            {/* When en route to destination, show ETA to destination */}
            {tripPhase === 'en_route_to_destination' && destinationCoords && (
              <MapViewDirections
                origin={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                }}
                destination={destinationCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={0}
                strokeColor="transparent"
                onReady={(result) => {
                  setRouteInfo({
                    distance: result.distance,
                    duration: result.duration,
                  });
                }}
              />
            )}
          </MapView>

          {/* Top Status Bar */}
          <View style={styles.topStatusBar}>
            <View style={[styles.phaseIndicator, { backgroundColor: phaseInfo.color }]}>
              <Ionicons name={phaseInfo.icon} size={18} color="#fff" />
              <Text style={styles.phaseText}>{phaseInfo.label}</Text>
            </View>
          </View>

          {/* ETA Card */}
          {routeInfo.duration && (
            <View style={styles.etaCard}>
              <Text style={styles.etaTime}>{formatDuration(routeInfo.duration)}</Text>
              <Text style={styles.etaLabel}>to {currentTargetLabel}</Text>
              <Text style={styles.etaDistance}>{routeInfo.distance?.toFixed(1)} km</Text>
            </View>
          )}

          {/* Route Legend */}
          <View style={styles.legendCard}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#2563EB' }]} />
              <Text style={styles.legendText}>To Pickup</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.legendText}>Trip Route</Text>
            </View>
          </View>

          {/* Bottom Card */}
          <View style={styles.bottomCard}>
            {/* Client Info */}
            <View style={styles.clientRow}>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.addressText} numberOfLines={1}>
                  {tripPhase === 'en_route_to_destination' ? trip.destination_address : trip.pickup_address}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.navButton}
                onPress={openNavigation}
              >
                <Ionicons name="navigate" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Action Button */}
            <View style={styles.actionRow}>
              {tripPhase === 'en_route_to_pickup' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
                  onPress={arrivedAtPickup}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="location" size={24} color="#fff" />
                      <Text style={styles.actionButtonText}>Arrived at Pickup</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {tripPhase === 'arrived_at_pickup' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  onPress={startRide}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="car" size={24} color="#fff" />
                      <Text style={styles.actionButtonText}>Start Ride</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {tripPhase === 'en_route_to_destination' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  onPress={completeTrip}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done-circle" size={24} color="#fff" />
                      <Text style={styles.actionButtonText}>Complete Trip</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : (
        /* Non-active trip view */
        <>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Status Badge */}
            <View style={styles.statusContainer}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
                <Ionicons name="information-circle" size={18} color="#fff" />
                <Text style={styles.statusText}>
                  {trip.status === 'in_progress' ? 'In Progress' : trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                </Text>
              </View>
              <Text style={styles.tripId}>Trip ID: {tripId}</Text>
            </View>

            {/* Map Preview */}
            {pickupCoords && destinationCoords && (
              <View style={styles.mapPreviewContainer}>
                <MapView
                  style={styles.mapPreview}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude: pickupCoords.latitude,
                    longitude: pickupCoords.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                >
                  <Marker coordinate={pickupCoords} pinColor="#10B981" />
                  <Marker coordinate={destinationCoords} pinColor="#EF4444" />
                  <MapViewDirections
                    origin={pickupCoords}
                    destination={destinationCoords}
                    apikey={GOOGLE_MAPS_API_KEY}
                    strokeWidth={3}
                    strokeColor="#007AFF"
                  />
                </MapView>
              </View>
            )}

            {/* Client Info Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person" size={24} color={BRAND_COLOR} />
                <Text style={styles.cardTitle}>Client Information</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name</Text>
                  <Text style={styles.detailValue}>{client.name}</Text>
                </View>
                {client.phone && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phone</Text>
                    <Text style={styles.detailValue}>{client.phone}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Time Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="time" size={24} color={BRAND_COLOR} />
                <Text style={styles.cardTitle}>Pickup Time</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.timeText}>{formatDateTime(trip.pickup_time)}</Text>
              </View>
            </View>

            {/* Locations Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="location" size={24} color={BRAND_COLOR} />
                <Text style={styles.cardTitle}>Trip Route</Text>
              </View>
              <View style={styles.cardContent}>
                <TouchableOpacity
                  style={styles.addressRow}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(trip.pickup_address)}`)}
                >
                  <View style={styles.addressIconContainer}>
                    <Ionicons name="location" size={20} color="#10B981" />
                  </View>
                  <View style={styles.addressTextContainer}>
                    <Text style={styles.addressLabel}>Pickup Location</Text>
                    <Text style={[styles.addressTextDetail, styles.linkText]}>{trip.pickup_address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <View style={styles.routeLine} />

                <TouchableOpacity
                  style={styles.addressRow}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(trip.destination_address)}`)}
                >
                  <View style={styles.addressIconContainer}>
                    <Ionicons name="flag" size={20} color="#EF4444" />
                  </View>
                  <View style={styles.addressTextContainer}>
                    <Text style={styles.addressLabel}>Destination</Text>
                    <Text style={[styles.addressTextDetail, styles.linkText]}>{trip.destination_address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Special Requirements */}
            {trip.special_requirements && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="alert-circle" size={24} color="#F59E0B" />
                  <Text style={styles.cardTitle}>Special Requirements</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.requirementsText}>{trip.special_requirements}</Text>
                </View>
              </View>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.bottomActionContainer}>
            {canAccept && (
              <TouchableOpacity
                style={[styles.bottomActionButton, { backgroundColor: BRAND_COLOR }]}
                onPress={acceptTrip}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.bottomActionText}>Accept Trip</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {canStart && (
              <TouchableOpacity
                style={[styles.bottomActionButton, { backgroundColor: '#F59E0B' }]}
                onPress={startTrip}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play-circle" size={24} color="#fff" />
                    <Text style={styles.bottomActionText}>Start Trip</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
  },
  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  statusContainer: {
    padding: 16,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tripId: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  // Full screen map styles
  fullMapContainer: {
    flex: 1,
  },
  fullMap: {
    flex: 1,
  },
  topStatusBar: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  phaseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  phaseText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  etaCard: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  etaTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  etaLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  etaDistance: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  legendCard: {
    position: 'absolute',
    top: 60,
    left: 16,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  legendLine: {
    width: 20,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  actionRow: {
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Map markers
  markerContainer: {
    alignItems: 'center',
  },
  markerDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  markerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  // Map preview styles
  mapPreviewContainer: {
    height: 200,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapPreview: {
    width: '100%',
    height: '100%',
  },
  // Card styles
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cardContent: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  timeText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addressIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressTextContainer: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  addressTextDetail: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#e0e0e0',
    marginLeft: 17,
    marginVertical: 4,
  },
  requirementsText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  linkText: {
    color: BRAND_COLOR,
  },
  bottomActionContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  bottomActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  bottomActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
