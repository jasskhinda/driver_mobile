import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShift } from '../contexts/ShiftContext';
import { useNavigation } from '@react-navigation/native';

export default function ClockScreen() {
  const navigation = useNavigation();
  const {
    currentShift,
    isClockedIn,
    inspectionRequired,
    loading,
    clockIn,
    clockOut,
    refreshShift,
  } = useShift();

  const [vehicleId, setVehicleId] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');

  // Update elapsed time every second when clocked in
  useEffect(() => {
    let interval;
    if (isClockedIn && currentShift?.clock_in) {
      const updateElapsed = () => {
        const start = new Date(currentShift.clock_in);
        const now = new Date();
        const diff = Math.floor((now - start) / 1000);

        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      };

      updateElapsed();
      interval = setInterval(updateElapsed, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isClockedIn, currentShift?.clock_in]);

  const handleClockIn = async () => {
    // Check if inspection is required
    if (inspectionRequired) {
      Alert.alert(
        'Inspection Required',
        'You must complete a daily vehicle inspection before clocking in.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start Inspection',
            onPress: () => navigation.navigate('VehicleInspection', { vehicleId, odometerStart })
          }
        ]
      );
      return;
    }

    if (!vehicleId.trim()) {
      Alert.alert('Error', 'Please enter a vehicle ID');
      return;
    }

    if (!odometerStart.trim()) {
      Alert.alert('Error', 'Please enter the starting odometer reading');
      return;
    }

    try {
      setProcessing(true);
      await clockIn(vehicleId.trim(), parseInt(odometerStart));
      Alert.alert('Success', 'You are now clocked in!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to clock in');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!odometerEnd.trim()) {
      Alert.alert('Error', 'Please enter the ending odometer reading');
      return;
    }

    const endReading = parseInt(odometerEnd);
    const startReading = currentShift?.odometer_start || 0;

    if (endReading < startReading) {
      Alert.alert('Error', 'Ending odometer must be greater than starting odometer');
      return;
    }

    Alert.alert(
      'Confirm Clock Out',
      `Total miles driven: ${endReading - startReading}\n\nAre you sure you want to clock out?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              await clockOut(endReading, notes.trim());
              setOdometerEnd('');
              setNotes('');
              setVehicleId('');
              setOdometerStart('');
              Alert.alert('Success', 'You have clocked out!');
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to clock out');
            } finally {
              setProcessing(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5bbcbe" />
          <Text style={styles.loadingText}>Loading shift status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons
            name={isClockedIn ? "time" : "time-outline"}
            size={48}
            color={isClockedIn ? "#4CAF50" : "#666"}
          />
          <Text style={styles.headerTitle}>
            {isClockedIn ? 'Currently Clocked In' : 'Clock In'}
          </Text>
          {isClockedIn && (
            <Text style={styles.elapsedTime}>{elapsedTime}</Text>
          )}
        </View>

        {/* Clocked In Info */}
        {isClockedIn && currentShift && (
          <View style={styles.shiftInfoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Vehicle:</Text>
              <Text style={styles.infoValue}>{currentShift.vehicle_id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Clock In Time:</Text>
              <Text style={styles.infoValue}>
                {new Date(currentShift.clock_in).toLocaleTimeString()}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Starting Odometer:</Text>
              <Text style={styles.infoValue}>
                {currentShift.odometer_start?.toLocaleString()} mi
              </Text>
            </View>
          </View>
        )}

        {/* Clock In Form */}
        {!isClockedIn && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Start Your Shift</Text>

            {inspectionRequired && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={20} color="#ff9800" />
                <Text style={styles.warningText}>
                  Daily vehicle inspection required before clock in
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Vehicle ID / Number</Text>
            <TextInput
              style={styles.input}
              value={vehicleId}
              onChangeText={setVehicleId}
              placeholder="Enter vehicle ID"
              placeholderTextColor="#999"
            />

            <Text style={styles.inputLabel}>Starting Odometer</Text>
            <TextInput
              style={styles.input}
              value={odometerStart}
              onChangeText={setOdometerStart}
              placeholder="Enter odometer reading"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.clockButton, styles.clockInButton]}
              onPress={handleClockIn}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={24} color="#fff" />
                  <Text style={styles.clockButtonText}>Clock In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Clock Out Form */}
        {isClockedIn && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>End Your Shift</Text>

            <Text style={styles.inputLabel}>Ending Odometer</Text>
            <TextInput
              style={styles.input}
              value={odometerEnd}
              onChangeText={setOdometerEnd}
              placeholder="Enter ending odometer reading"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any notes about your shift..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.clockButton, styles.clockOutButton]}
              onPress={handleClockOut}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={24} color="#fff" />
                  <Text style={styles.clockButtonText}>Clock Out</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('VehicleInspection', {
              vehicleId: isClockedIn ? currentShift?.vehicle_id : vehicleId,
              odometerStart: isClockedIn ? currentShift?.odometer_start : odometerStart
            })}
          >
            <Ionicons name="clipboard-outline" size={24} color="#5bbcbe" />
            <Text style={styles.actionButtonText}>Vehicle Inspection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('ShiftHistory')}
          >
            <Ionicons name="calendar-outline" size={24} color="#5bbcbe" />
            <Text style={styles.actionButtonText}>Shift History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  elapsedTime: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  shiftInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    marginLeft: 8,
    color: '#e65100',
    fontSize: 14,
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  clockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  clockInButton: {
    backgroundColor: '#4CAF50',
  },
  clockOutButton: {
    backgroundColor: '#f44336',
  },
  clockButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: '#5bbcbe',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
});
