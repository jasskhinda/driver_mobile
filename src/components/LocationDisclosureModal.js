import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Prominent Disclosure Modal for Background Location Permission
 *
 * This component satisfies Google Play's "Prominent Disclosure and Consent Requirement"
 * for apps that access background location.
 *
 * Requirements met:
 * 1. Displayed BEFORE requesting background location permission
 * 2. Clearly explains what data is collected (location)
 * 3. Explains how the data is used (trip tracking)
 * 4. Explains when data is collected (during active trips)
 * 5. Requires explicit user consent via button press
 */
const LocationDisclosureModal = ({ visible, onAccept, onDecline }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onDecline}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="location" size={48} color="#007AFF" />
          </View>

          <Text style={styles.title}>Background Location Access</Text>

          <Text style={styles.subtitle}>
            CCT Driver needs access to your location
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What We Collect</Text>
            <Text style={styles.sectionText}>
              This app collects your device's precise location data, including
              latitude, longitude, speed, and heading.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>When We Collect</Text>
            <Text style={styles.sectionText}>
              Location data is collected <Text style={styles.bold}>only during active trips</Text> when
              you have started a trip. Location tracking automatically stops when the trip ends.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why We Need Background Access</Text>
            <Text style={styles.sectionText}>
              Background location access allows the app to continue tracking your
              trip even when:
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• The app is minimized</Text>
              <Text style={styles.bulletItem}>• Your screen is off</Text>
              <Text style={styles.bulletItem}>• You're using other apps</Text>
            </View>
            <Text style={styles.sectionText}>
              This ensures accurate trip records and allows dispatchers to monitor
              trip progress for customer updates.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptButtonText}>I Understand, Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.declineButton}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={styles.declineButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footnote}>
            You can change location permissions at any time in your device settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 30,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 16,
  },
  section: {
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 13,
    color: '#4a4a4a',
    lineHeight: 18,
  },
  bold: {
    fontWeight: '600',
  },
  bulletList: {
    marginTop: 4,
    marginLeft: 8,
  },
  bulletItem: {
    fontSize: 13,
    color: '#4a4a4a',
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: 16,
    gap: 10,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  declineButton: {
    backgroundColor: '#F0F0F0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#666666',
    fontSize: 15,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'center',
    marginTop: 12,
  },
});

export default LocationDisclosureModal;
