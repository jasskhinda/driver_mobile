import React, { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useGPSTracking } from '../hooks/useGPSTracking';

const BRAND_COLOR = '#5fbfc0';
const { width } = Dimensions.get('window');

export default function TripDetailsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const mapRef = React.useRef(null);

  // Enable GPS tracking when trip is in_progress
  const isTracking = trip?.status === 'in_progress' && trip?.driver_id === user?.id;
  const { location, hasPermission } = useGPSTracking(tripId, user?.id, isTracking);

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
          setTrip(payload.new);
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

      // Fetch facility managed client data
      if (tripData.managed_client_id) {
        const { data: clientData } = await supabase
          .from('facility_managed_clients')
          .select('first_name, last_name, phone')
          .eq('id', tripData.managed_client_id)
          .single();
        if (clientData) enrichedTrip.facility_managed_clients = clientData;
      }

      // Fetch individual user profile data
      if (tripData.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, phone')
          .eq('id', tripData.user_id)
          .single();
        if (profileData) enrichedTrip.profiles = profileData;
      }

      // Fetch driver data
      if (tripData.driver_id) {
        const { data: driverData } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, phone')
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
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=AIzaSyDylwCsypHOs6T9e-JnTA7AoqOMrc3hbhE`
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

  // Fit map to show all markers
  useEffect(() => {
    if (mapRef.current && pickupCoords && destinationCoords && location) {
      const coordinates = [
        pickupCoords,
        destinationCoords,
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      ];
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [pickupCoords, destinationCoords, location]);

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
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (newStatus) => {
    setActionLoading(true);
    try {
      const updateData = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Update driver_acceptance_status along with trip status
      if (newStatus === 'in_progress') {
        updateData.driver_acceptance_status = 'started';
      } else if (newStatus === 'completed') {
        updateData.driver_acceptance_status = 'completed';
      }

      const { error } = await supabase
        .from('trips')
        .update(updateData)
        .eq('id', tripId);

      if (error) throw error;

      Alert.alert('Success', `Trip marked as ${newStatus}`);
      fetchTripDetails();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openMaps = (address) => {
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const callClient = (phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert('No Phone', 'Client phone number not available');
    }
  };

  const getClientInfo = () => {
    if (trip?.facility_managed_clients) {
      return {
        name: `${trip.facility_managed_clients.first_name} ${trip.facility_managed_clients.last_name}`,
        phone: trip.facility_managed_clients.phone,
      };
    }
    if (trip?.profiles) {
      return {
        name: `${trip.profiles.first_name || ''} ${trip.profiles.last_name || ''}`.trim() || trip.profiles.email,
        phone: trip.profiles.phone,
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
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
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
  // Driver can accept if they are assigned and haven't accepted yet
  // Fallback: if driver_acceptance_status doesn't exist, check assigned_driver_id
  const canAccept = trip.assigned_driver_id === user.id &&
                    !trip.driver_id &&
                    (trip.driver_acceptance_status === 'assigned_waiting' ||
                     !trip.driver_acceptance_status); // Fallback for trips without the column
  // Driver can start if they've accepted (driver_id set and driver_acceptance_status is 'accepted')
  // Fallback: if driver_acceptance_status doesn't exist, check driver_id and status
  const canStart = trip.driver_id === user.id &&
                   (trip.driver_acceptance_status === 'accepted' ||
                    (!trip.driver_acceptance_status && trip.status === 'upcoming')) &&
                   trip.status !== 'in_progress';
  const canComplete = trip.status === 'in_progress' && trip.driver_id === user.id;

  const getStatusColor = (status) => {
    switch (status) {
      case 'assigned':
        return '#3B82F6';
      case 'in_progress':
        return '#F59E0B';
      case 'completed':
        return '#10B981';
      case 'cancelled':
        return '#EF4444';
      case 'approved':
        return BRAND_COLOR;
      default:
        return '#6B7280';
    }
  };

  const getStatusLabel = (status) => {
    return status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
            <Ionicons name="information-circle" size={18} color="#fff" />
            <Text style={styles.statusText}>{getStatusLabel(trip.status)}</Text>
          </View>
        </View>

        {/* Map View - Show when trip is in progress or assigned */}
        {(trip.status === 'in_progress' || trip.status === 'assigned') && pickupCoords && destinationCoords && (
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: pickupCoords.latitude,
                longitude: pickupCoords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              showsUserLocation={true}
              showsMyLocationButton={true}
              loadingEnabled={true}
            >
              {/* Pickup Marker */}
              <Marker
                coordinate={pickupCoords}
                title="Pickup Location"
                description={trip.pickup_address}
                pinColor="#10B981"
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.markerDot, { backgroundColor: '#10B981' }]} />
                </View>
              </Marker>

              {/* Destination Marker */}
              <Marker
                coordinate={destinationCoords}
                title="Destination"
                description={trip.destination_address}
                pinColor="#EF4444"
              >
                <View style={styles.markerContainer}>
                  <View style={[styles.markerDot, { backgroundColor: '#EF4444' }]} />
                </View>
              </Marker>

              {/* Driver Current Location Marker - Only show when tracking */}
              {isTracking && location && (
                <Marker
                  coordinate={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  }}
                  title="Your Location"
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.driverMarker}>
                    <Ionicons name="navigate-circle" size={40} color={BRAND_COLOR} />
                  </View>
                </Marker>
              )}

              {/* Route Line */}
              {location && isTracking && (
                <Polyline
                  coordinates={[
                    pickupCoords,
                    {
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                    },
                    destinationCoords,
                  ]}
                  strokeColor={BRAND_COLOR}
                  strokeWidth={4}
                  lineDashPattern={[1]}
                />
              )}
            </MapView>

            {/* GPS Status Indicator */}
            {isTracking && (
              <View style={styles.gpsIndicator}>
                <View style={styles.gpsDot} />
                <Text style={styles.gpsText}>Live Tracking Active</Text>
              </View>
            )}
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
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => callClient(client.phone)}
              >
                <Text style={styles.detailLabel}>Phone</Text>
                <View style={styles.phoneContainer}>
                  <Text style={[styles.detailValue, styles.linkText]}>{client.phone}</Text>
                  <Ionicons name="call" size={18} color={BRAND_COLOR} />
                </View>
              </TouchableOpacity>
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
              onPress={() => openMaps(trip.pickup_address)}
            >
              <View style={styles.addressIconContainer}>
                <Ionicons name="location" size={20} color="#10B981" />
              </View>
              <View style={styles.addressTextContainer}>
                <Text style={styles.addressLabel}>Pickup Location</Text>
                <Text style={[styles.addressText, styles.linkText]}>{trip.pickup_address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <View style={styles.routeLine} />

            <TouchableOpacity
              style={styles.addressRow}
              onPress={() => openMaps(trip.destination_address)}
            >
              <View style={styles.addressIconContainer}>
                <Ionicons name="flag" size={20} color="#EF4444" />
              </View>
              <View style={styles.addressTextContainer}>
                <Text style={styles.addressLabel}>Destination</Text>
                <Text style={[styles.addressText, styles.linkText]}>{trip.destination_address}</Text>
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
      <View style={styles.actionContainer}>
        {canAccept && (
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={acceptTrip}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>Accept Trip</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canStart && (
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton]}
            onPress={() => updateStatus('in_progress')}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="play-circle" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>Start Trip</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canComplete && (
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
            onPress={() => updateStatus('completed')}
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
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  addressText: {
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
  actionContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: BRAND_COLOR,
  },
  startButton: {
    backgroundColor: '#F59E0B',
  },
  completeButton: {
    backgroundColor: '#10B981',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    height: 300,
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
  map: {
    width: '100%',
    height: '100%',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  driverMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
    gap: 6,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  gpsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
});
