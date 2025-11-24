import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const BRAND_COLOR = '#5fbfc0';

export default function TripsScreen({ navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('assigned'); // assigned, available, completed

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    fetchTrips();

    // Subscribe to real-time updates for trips assigned to or accepted by this driver
    const subscription = supabase
      .channel('driver_trips')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
        },
        (payload) => {
          // Refresh if this driver is involved
          if (payload.new?.driver_id === user?.id || payload.new?.assigned_driver_id === user?.id ||
              payload.old?.driver_id === user?.id || payload.old?.assigned_driver_id === user?.id) {
            fetchTrips();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [filter, user?.id]);

  const fetchTrips = async () => {
    try {
      let rawTrips = [];

      if (filter === 'assigned') {
        // Fetch trips where driver is assigned OR has accepted
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .or(`driver_id.eq.${user?.id},assigned_driver_id.eq.${user?.id}`)
          .in('status', ['upcoming', 'assigned', 'in_progress'])
          .order('pickup_time', { ascending: true });

        if (error) throw error;
        rawTrips = data || [];
      } else if (filter === 'available') {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('status', 'approved')
          .is('driver_id', null)
          .order('pickup_time', { ascending: true });

        if (error) throw error;
        rawTrips = data || [];
      } else if (filter === 'completed') {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('driver_id', user?.id)
          .in('status', ['completed', 'cancelled'])
          .order('pickup_time', { ascending: true });

        if (error) throw error;
        rawTrips = data || [];
      }

      // Enrich trips with client data
      const tripsWithData = await Promise.all(
        (rawTrips || []).map(async (trip) => {
          const tripData = { ...trip };

          // Fetch facility managed client data
          if (trip.managed_client_id) {
            const { data: clientData } = await supabase
              .from('facility_managed_clients')
              .select('first_name, last_name')
              .eq('id', trip.managed_client_id)
              .single();
            if (clientData) tripData.facility_managed_clients = clientData;
          }

          // Fetch individual user profile data
          if (trip.user_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('first_name, last_name, email')
              .eq('id', trip.user_id)
              .single();
            if (profileData) tripData.profiles = profileData;
          }

          return tripData;
        })
      );

      setTrips(tripsWithData);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrips();
  };

  const getClientName = (trip) => {
    if (trip.facility_managed_clients) {
      return `${trip.facility_managed_clients.first_name} ${trip.facility_managed_clients.last_name}`;
    }
    if (trip.profiles) {
      return `${trip.profiles.first_name || ''} ${trip.profiles.last_name || ''}`.trim() || trip.profiles.email;
    }
    return 'Unknown Client';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'TBD';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

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
      default:
        return '#6B7280';
    }
  };

  const renderTrip = ({ item }) => (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={() => navigation.navigate('TripDetails', { tripId: item.id })}
    >
      <View style={styles.tripHeader}>
        <Text style={styles.clientName}>{getClientName(item)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.tripDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.detailText}>{formatTime(item.pickup_time)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={styles.detailText} numberOfLines={1}>
            {item.pickup_address}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="navigate-outline" size={16} color="#666" />
          <Text style={styles.detailText} numberOfLines={1}>
            {item.destination_address}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="car-outline" size={80} color="#ccc" />
      <Text style={styles.emptyText}>
        {filter === 'assigned' && 'No assigned trips'}
        {filter === 'available' && 'No available trips'}
        {filter === 'completed' && 'No completed trips'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
      </View>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/headerlogo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'assigned' && styles.filterButtonActive]}
          onPress={() => setFilter('assigned')}
        >
          <Text style={[styles.filterText, filter === 'assigned' && styles.filterTextActive]}>
            My Trips
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filter === 'available' && styles.filterButtonActive]}
          onPress={() => setFilter('available')}
        >
          <Text style={[styles.filterText, filter === 'available' && styles.filterTextActive]}>
            Available
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={trips}
        renderItem={renderTrip}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND_COLOR} />
        }
        contentContainerStyle={[styles.listContent, trips.length === 0 && styles.emptyListContent]}
      />
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
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  logoImage: {
    width: 150,
    height: 80,
  },
  menuButton: {
    padding: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: BRAND_COLOR,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tripDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
