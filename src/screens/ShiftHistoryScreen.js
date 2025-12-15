import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShift } from '../contexts/ShiftContext';
import { useNavigation } from '@react-navigation/native';

const BRAND_COLOR = '#5fbfc0';

export default function ShiftHistoryScreen() {
  const navigation = useNavigation();
  const { getShiftHistory } = useShift();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadShifts = async () => {
    try {
      const data = await getShiftHistory(50);
      setShifts(data);
    } catch (err) {
      console.error('Error loading shifts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadShifts();
  };

  const formatDuration = (hours) => {
    if (!hours) return '--';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderShiftItem = ({ item }) => {
    const isActive = !item.clock_out;
    const miles = item.odometer_end && item.odometer_start
      ? item.odometer_end - item.odometer_start
      : null;

    return (
      <View style={[styles.shiftCard, isActive && styles.activeShiftCard]}>
        {isActive && (
          <View style={styles.activeBadge}>
            <Ionicons name="radio-button-on" size={12} color="#4CAF50" />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        )}

        <View style={styles.shiftHeader}>
          <Text style={styles.shiftDate}>{formatDate(item.clock_in)}</Text>
          <Text style={styles.vehicleId}>Vehicle: {item.vehicle_id}</Text>
        </View>

        <View style={styles.shiftDetails}>
          <View style={styles.detailColumn}>
            <Text style={styles.detailLabel}>Clock In</Text>
            <Text style={styles.detailValue}>{formatTime(item.clock_in)}</Text>
          </View>

          <View style={styles.detailColumn}>
            <Text style={styles.detailLabel}>Clock Out</Text>
            <Text style={styles.detailValue}>{formatTime(item.clock_out)}</Text>
          </View>

          <View style={styles.detailColumn}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailValue}>{formatDuration(item.total_hours)}</Text>
          </View>
        </View>

        <View style={styles.mileageRow}>
          <View style={styles.mileageItem}>
            <Ionicons name="speedometer-outline" size={16} color="#666" />
            <Text style={styles.mileageText}>
              Start: {item.odometer_start?.toLocaleString() || '--'} mi
            </Text>
          </View>
          <View style={styles.mileageItem}>
            <Ionicons name="speedometer" size={16} color="#666" />
            <Text style={styles.mileageText}>
              End: {item.odometer_end?.toLocaleString() || '--'} mi
            </Text>
          </View>
          {miles !== null && (
            <View style={styles.mileageItem}>
              <Ionicons name="car-outline" size={16} color="#5bbcbe" />
              <Text style={[styles.mileageText, styles.totalMiles]}>
                {miles.toLocaleString()} miles
              </Text>
            </View>
          )}
        </View>

        {item.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* App Header */}
        <View style={styles.appHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Image
            source={require('../../assets/headerlogo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5bbcbe" />
          <Text style={styles.loadingText}>Loading shift history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App Header */}
      <View style={styles.appHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Image
          source={require('../../assets/headerlogo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.contentHeader}>
        <Text style={styles.headerTitle}>Shift History</Text>
        <Text style={styles.headerSubtitle}>
          {shifts.length} shift{shifts.length !== 1 ? 's' : ''} recorded
        </Text>
      </View>

      {shifts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Shifts Yet</Text>
          <Text style={styles.emptyText}>
            Your shift history will appear here after you clock in.
          </Text>
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          renderItem={renderShiftItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#5bbcbe']}
              tintColor="#5bbcbe"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appHeader: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 8,
  },
  logoImage: {
    width: 120,
    height: 50,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  contentHeader: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  shiftCard: {
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
  activeShiftCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  activeBadgeText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shiftDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  vehicleId: {
    fontSize: 14,
    color: '#5bbcbe',
    fontWeight: '500',
  },
  shiftDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  detailColumn: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  mileageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 12,
  },
  mileageItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mileageText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  totalMiles: {
    color: '#5bbcbe',
    fontWeight: '600',
  },
  notesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  notesLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
