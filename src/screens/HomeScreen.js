import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const BRAND_COLOR = '#5fbfc0';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    assigned: 0,
    available: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [upcomingTrips, setUpcomingTrips] = useState([]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    fetchStats();
  }, [user?.id]);

  const fetchStats = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const [assignedResult, availableResult, completedResult, upcomingTripsResult] = await Promise.all([
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('driver_id', user?.id)
          .in('status', ['assigned', 'in_progress']),
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
          .is('driver_id', null),
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('driver_id', user?.id)
          .eq('status', 'completed'),
        supabase
          .from('trips')
          .select('*')
          .eq('driver_id', user?.id)
          .in('status', ['assigned', 'in_progress'])
          .order('pickup_time', { ascending: true })
          .limit(3),
      ]);

      setStats({
        assigned: assignedResult.count || 0,
        available: availableResult.count || 0,
        completed: completedResult.count || 0,
      });

      // Enrich trips with client data
      const tripsWithData = await Promise.all(
        (upcomingTripsResult.data || []).map(async (trip) => {
          const tripData = { ...trip };

          if (trip.managed_client_id) {
            const { data: clientData } = await supabase
              .from('facility_managed_clients')
              .select('first_name, last_name')
              .eq('id', trip.managed_client_id)
              .single();
            if (clientData) tripData.facility_managed_clients = clientData;
          }

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

      setUpcomingTrips(tripsWithData);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
      default:
        return '#6B7280';
    }
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

      <ScrollView style={styles.content}>
        <View style={styles.welcomeCard}>
          <Ionicons name="person-circle-outline" size={60} color={BRAND_COLOR} />
          <Text style={styles.welcomeText}>Welcome, Driver!</Text>
          <Text style={styles.emailText}>{user?.email}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={BRAND_COLOR} style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Ionicons name="car" size={32} color={BRAND_COLOR} />
              <Text style={styles.statNumber}>{stats.assigned}</Text>
              <Text style={styles.statLabel}>My Trips</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="time" size={32} color="#F59E0B" />
              <Text style={styles.statNumber}>{stats.available}</Text>
              <Text style={styles.statLabel}>Available</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle" size={32} color="#10B981" />
              <Text style={styles.statNumber}>{stats.completed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
        )}

        <View style={styles.upcomingTripsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Upcoming Trips</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Trips')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {upcomingTrips.length === 0 ? (
            <View style={styles.emptyTrips}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <Text style={styles.emptyTripsText}>No upcoming trips</Text>
            </View>
          ) : (
            upcomingTrips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripCard}
                onPress={() => navigation.navigate('TripDetails', { tripId: trip.id })}
              >
                <View style={styles.tripCardHeader}>
                  <Text style={styles.tripClientName}>{getClientName(trip)}</Text>
                  <View style={[styles.tripStatusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
                    <Text style={styles.tripStatusText}>{trip.status}</Text>
                  </View>
                </View>
                <View style={styles.tripCardDetails}>
                  <View style={styles.tripDetailRow}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <Text style={styles.tripDetailText}>{formatTime(trip.pickup_time)}</Text>
                  </View>
                  <View style={styles.tripDetailRow}>
                    <Ionicons name="location-outline" size={16} color="#666" />
                    <Text style={styles.tripDetailText} numberOfLines={1}>
                      {trip.pickup_address}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Trips')}
          >
            <Ionicons name="list" size={48} color={BRAND_COLOR} />
            <Text style={styles.actionTitle}>View All Trips</Text>
            <Text style={styles.actionDescription}>See all your trips</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person" size={48} color={BRAND_COLOR} />
            <Text style={styles.actionTitle}>Profile</Text>
            <Text style={styles.actionDescription}>Update your info</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoImage: {
    width: 150,
    height: 80,
  },
  badge: {
    backgroundColor: BRAND_COLOR,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  menuButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  welcomeCard: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
  },
  emailText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  actionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  upcomingTripsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_COLOR,
  },
  emptyTrips: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyTripsText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
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
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripClientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  tripStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tripStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  tripCardDetails: {
    gap: 8,
  },
  tripDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripDetailText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
});
