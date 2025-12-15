import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShift } from '../contexts/ShiftContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import SignatureCanvas from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';

const BRAND_COLOR = '#5fbfc0';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Inspection sections based on ODA0008 form
const INSPECTION_SECTIONS = [
  {
    title: 'Exterior',
    items: [
      { key: 'ground_free_of_fluids', label: 'Ground under vehicle free of leaked fluids?' },
      { key: 'body_free_of_damage', label: 'Auto body free of new damage?' },
      { key: 'windows_mirrors_clean', label: 'Clean windows and mirrors?' },
      { key: 'wipers_washers_ok', label: 'Windshield wipers/washers appear OK?' },
    ],
  },
  {
    title: 'Tires',
    items: [
      { key: 'tires_properly_inflated', label: 'Properly inflated?' },
      { key: 'tires_free_of_damage', label: 'Free of visible damage?' },
    ],
  },
  {
    title: 'Under the Hood',
    subtitle: 'Check oil and belts before starting vehicle',
    items: [
      { key: 'adequate_clean_oil', label: 'Adequate clean oil?' },
      { key: 'hoses_ok', label: 'Hoses appear OK? (no cracks, leaks)' },
      { key: 'belts_ok', label: 'Belts appear OK? (no fraying)' },
      { key: 'washer_fluid_ok', label: 'Adequate windshield washer fluid?' },
    ],
  },
  {
    title: 'Items Stored in Vehicle',
    items: [
      { key: 'valid_insurance_card', label: 'Current, valid insurance ID card?' },
      { key: 'valid_registration', label: 'Current, valid vehicle registration?' },
      { key: 'biohazard_kit', label: 'Biohazard kit?' },
      { key: 'first_aid_kit', label: 'First-aid kit?' },
      { key: 'seatbelt_cutter', label: 'Seatbelt cutter?' },
      { key: 'flares_triangles', label: 'Flares or reflective triangles?' },
      { key: 'fire_extinguisher', label: 'Fire extinguisher?' },
      { key: 'blanket_winter', label: 'Blanket? (winter only)' },
    ],
  },
  {
    title: 'Interior Items',
    items: [
      { key: 'seat_belts_ok', label: 'Seat belts OK?' },
      { key: 'seats_hazard_free', label: 'Seats hazard-free (tears, loose armrests)?' },
      { key: 'floor_free_of_hazards', label: 'Floor free of hazards?' },
      { key: 'interior_clean', label: 'Clean interior?' },
      { key: 'mirrors_adjusted', label: 'Mirrors adjusted properly?' },
      { key: 'doors_operate_ok', label: 'Doors operate from inside and outside?' },
      { key: 'door_locks_ok', label: 'Door locks work?' },
      { key: 'gauges_ok', label: 'Gauges OK? (oil, fuel, temp)' },
      { key: 'fuel_adequate', label: 'Fuel level adequate?' },
      { key: 'no_warning_lights', label: 'No warning lights lit?' },
      { key: 'communication_device', label: '2-way communication device? (radio/cell)' },
      { key: 'horn_ok', label: 'Horn works?' },
      { key: 'backup_alarm_ok', label: 'Back-up alarm works? (if equipped)' },
      { key: 'brakes_ok', label: 'Brakes OK?' },
      { key: 'heater_ac_ok', label: 'Heater, defroster, and AC work?' },
    ],
  },
  {
    title: 'Lights',
    subtitle: 'Use a second person to inspect brake and back-up lights',
    items: [
      { key: 'headlights_ok', label: 'Each headlight (high & low beam)?' },
      { key: 'tail_lights_ok', label: 'Each tail light and marker light?' },
      { key: 'brake_lights_ok', label: 'Each brake light?' },
      { key: 'turn_signals_ok', label: 'Each turn signal?' },
      { key: 'backup_lights_ok', label: 'Each back-up light?' },
      { key: 'hazard_lights_ok', label: 'Hazard lights (front and rear)?' },
      { key: 'license_plate_light_ok', label: 'License plate light?' },
      { key: 'interior_lights_ok', label: 'Interior lights?' },
    ],
  },
  {
    title: 'Wheelchair Lift/Ramp',
    subtitle: 'If equipped',
    optional: true,
    items: [
      { key: 'lift_operates_ok', label: 'Operates through complete cycle?' },
      { key: 'lift_secured', label: 'Properly secured to vehicle?' },
      { key: 'lift_restraints_ok', label: 'Proper number of restraints?' },
      { key: 'lift_no_damage', label: 'Free of physical damage or leaking fluid?' },
      { key: 'lift_clean', label: 'Free of dirt, mud, gravel, salt, etc.?' },
    ],
  },
];

export default function VehicleInspectionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { saveInspection, todayInspection } = useShift();

  const [vehicleId, setVehicleId] = useState(route.params?.vehicleId || '');
  const [vinLast6, setVinLast6] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [odometer, setOdometer] = useState(route.params?.odometerStart?.toString() || '');
  const [hasWheelchairLift, setHasWheelchairLift] = useState(false);
  const [inspectionItems, setInspectionItems] = useState({});
  const [issuesFound, setIssuesFound] = useState('');
  const [driverSignature, setDriverSignature] = useState('');
  const [signatureImage, setSignatureImage] = useState(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const signatureRef = useRef(null);

  // Toggle an inspection item
  const toggleItem = (key) => {
    setInspectionItems(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? true : !prev[key]
    }));
  };

  // Set all items in a section to Yes
  const setAllYes = (section) => {
    const updates = {};
    section.items.forEach(item => {
      updates[item.key] = true;
    });
    setInspectionItems(prev => ({ ...prev, ...updates }));
  };

  // Handle signature from canvas
  const handleSignature = (signature) => {
    setSignatureImage(signature);
    setShowSignatureModal(false);
  };

  // Clear drawn signature
  const handleClearSignature = () => {
    signatureRef.current?.clearSignature();
  };

  // Handle empty signature (when user tries to save without drawing)
  const handleEmpty = () => {
    Alert.alert('Signature Required', 'Please draw your signature before saving.');
  };

  // Handle upload signature button - directly launch picker (iOS handles permissions)
  const handleUploadSignature = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 2],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = asset.base64
          ? `data:image/png;base64,${asset.base64}`
          : asset.uri;
        setSignatureImage(base64Image);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  // Clear signature image
  const clearSignatureImage = () => {
    setSignatureImage(null);
  };

  // Check if all required items are checked
  const validateInspection = () => {
    if (!vehicleId.trim()) {
      Alert.alert('Error', 'Please enter a Vehicle ID');
      return false;
    }
    if (!odometer.trim()) {
      Alert.alert('Error', 'Please enter the odometer reading');
      return false;
    }
    if (!driverSignature.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }
    if (!signatureImage) {
      Alert.alert('Error', 'Please provide your signature by drawing or uploading an image');
      return false;
    }

    // Check that all non-optional items have been checked
    let uncheckedItems = [];
    INSPECTION_SECTIONS.forEach(section => {
      if (section.optional && !hasWheelchairLift) return;
      section.items.forEach(item => {
        if (inspectionItems[item.key] === undefined) {
          uncheckedItems.push(item.label);
        }
      });
    });

    if (uncheckedItems.length > 0) {
      Alert.alert(
        'Incomplete Inspection',
        `Please check all items. ${uncheckedItems.length} items remaining.`,
        [{ text: 'OK' }]
      );
      return false;
    }

    // Check for any "No" answers
    const failedItems = [];
    Object.entries(inspectionItems).forEach(([key, value]) => {
      if (value === false) {
        const item = INSPECTION_SECTIONS.flatMap(s => s.items).find(i => i.key === key);
        if (item) failedItems.push(item.label);
      }
    });

    if (failedItems.length > 0 && !issuesFound.trim()) {
      Alert.alert(
        'Issues Found',
        'You marked some items as "No". Please describe the issues in the Issues Found field.',
        [{ text: 'OK' }]
      );
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateInspection()) return;

    try {
      setProcessing(true);

      const inspectionData = {
        vehicle_id: vehicleId.trim(),
        vehicle_vin_last6: vinLast6.trim() || null,
        vehicle_make_model: makeModel.trim() || null,
        odometer_reading: parseInt(odometer),
        has_wheelchair_lift: hasWheelchairLift,
        issues_found: issuesFound.trim() || null,
        driver_signature: driverSignature.trim(),
        signature_image: signatureImage,
        ...inspectionItems,
      };

      await saveInspection(inspectionData);

      Alert.alert(
        'Inspection Complete',
        'Your vehicle inspection has been saved successfully.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save inspection');
    } finally {
      setProcessing(false);
    }
  };

  // If already completed today's inspection
  if (todayInspection) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
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

        <View style={styles.completedContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          <Text style={styles.completedTitle}>Inspection Complete</Text>
          <Text style={styles.completedText}>
            You have already completed today's vehicle inspection.
          </Text>
          <View style={styles.completedInfo}>
            <Text style={styles.infoLabel}>Vehicle: {todayInspection.vehicle_id}</Text>
            <Text style={styles.infoLabel}>
              Time: {new Date(todayInspection.signed_at || todayInspection.created_at).toLocaleTimeString()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Form Header */}
        <View style={styles.formHeader}>
          <Text style={styles.headerTitle}>Daily Vehicle Inspection</Text>
          <Text style={styles.headerSubtitle}>Form ODA0008</Text>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </View>

        {/* Vehicle Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Information</Text>

          <Text style={styles.inputLabel}>Vehicle ID *</Text>
          <TextInput
            style={styles.input}
            value={vehicleId}
            onChangeText={setVehicleId}
            placeholder="Enter vehicle ID"
            placeholderTextColor="#999"
          />

          <Text style={styles.inputLabel}>Last 6 Digits of VIN</Text>
          <TextInput
            style={styles.input}
            value={vinLast6}
            onChangeText={setVinLast6}
            placeholder="e.g., 123456"
            placeholderTextColor="#999"
            maxLength={6}
          />

          <Text style={styles.inputLabel}>Make & Model</Text>
          <TextInput
            style={styles.input}
            value={makeModel}
            onChangeText={setMakeModel}
            placeholder="e.g., Ford Transit"
            placeholderTextColor="#999"
          />

          <Text style={styles.inputLabel}>Odometer Reading *</Text>
          <TextInput
            style={styles.input}
            value={odometer}
            onChangeText={setOdometer}
            placeholder="Enter current mileage"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Vehicle has wheelchair lift/ramp?</Text>
            <Switch
              value={hasWheelchairLift}
              onValueChange={setHasWheelchairLift}
              trackColor={{ false: '#ddd', true: '#5bbcbe' }}
              thumbColor={hasWheelchairLift ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Inspection Sections */}
        {INSPECTION_SECTIONS.map((section) => {
          if (section.optional && !hasWheelchairLift) return null;

          return (
            <View key={section.title} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.subtitle && (
                    <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.allYesButton}
                  onPress={() => setAllYes(section)}
                >
                  <Text style={styles.allYesText}>All Yes</Text>
                </TouchableOpacity>
              </View>

              {section.items.map((item) => (
                <View key={item.key} style={styles.checkItem}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  <View style={styles.checkButtons}>
                    <TouchableOpacity
                      style={[
                        styles.checkButton,
                        styles.yesButton,
                        inspectionItems[item.key] === true && styles.yesButtonActive,
                      ]}
                      onPress={() => setInspectionItems(prev => ({ ...prev, [item.key]: true }))}
                    >
                      <Text style={[
                        styles.checkButtonText,
                        inspectionItems[item.key] === true && styles.checkButtonTextActive,
                      ]}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.checkButton,
                        styles.noButton,
                        inspectionItems[item.key] === false && styles.noButtonActive,
                      ]}
                      onPress={() => setInspectionItems(prev => ({ ...prev, [item.key]: false }))}
                    >
                      <Text style={[
                        styles.checkButtonText,
                        inspectionItems[item.key] === false && styles.checkButtonTextActive,
                      ]}>No</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        {/* Issues Found */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issues Found</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={issuesFound}
            onChangeText={setIssuesFound}
            placeholder="Describe any issues found during inspection..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Attestation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attestation</Text>
          <Text style={styles.attestationText}>
            I hereby verify that the inspection findings above are accurate.
          </Text>

          <Text style={styles.inputLabel}>Your Full Name *</Text>
          <TextInput
            style={styles.input}
            value={driverSignature}
            onChangeText={setDriverSignature}
            placeholder="Enter your full name"
            placeholderTextColor="#999"
          />

          <Text style={[styles.inputLabel, { marginTop: 16 }]}>Signature *</Text>
          <Text style={styles.signatureHelpText}>
            Please provide your signature by drawing below or uploading an image from your photo library.
          </Text>

          {/* Signature Preview */}
          {signatureImage ? (
            <View style={styles.signaturePreviewContainer}>
              <Image
                source={{ uri: signatureImage }}
                style={styles.signaturePreview}
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.clearSignatureButton}
                onPress={clearSignatureImage}
              >
                <Ionicons name="close-circle" size={24} color="#f44336" />
                <Text style={styles.clearSignatureText}>Clear Signature</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.signatureButtonsContainer}>
              {/* Draw Signature Button */}
              <TouchableOpacity
                style={styles.signatureOptionButton}
                onPress={() => setShowSignatureModal(true)}
              >
                <View style={styles.signatureOptionIcon}>
                  <Ionicons name="pencil" size={28} color={BRAND_COLOR} />
                </View>
                <Text style={styles.signatureOptionText}>Draw Signature</Text>
                <Text style={styles.signatureOptionSubtext}>
                  Sign using your finger
                </Text>
              </TouchableOpacity>

              {/* Upload Signature Button */}
              <TouchableOpacity
                style={styles.signatureOptionButton}
                onPress={handleUploadSignature}
              >
                <View style={styles.signatureOptionIcon}>
                  <Ionicons name="image" size={28} color={BRAND_COLOR} />
                </View>
                <Text style={styles.signatureOptionText}>Upload Image</Text>
                <Text style={styles.signatureOptionSubtext}>
                  From photo library
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Signature Drawing Modal */}
        <Modal
          visible={showSignatureModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowSignatureModal(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowSignatureModal(false)}
              >
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Draw Your Signature</Text>
              <TouchableOpacity
                style={styles.modalClearButton}
                onPress={handleClearSignature}
              >
                <Text style={styles.modalClearText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.signatureCanvasContainer}>
              <Text style={styles.signatureInstructions}>
                Use your finger to sign in the box below
              </Text>
              <SignatureCanvas
                ref={signatureRef}
                onOK={handleSignature}
                onEmpty={handleEmpty}
                descriptionText=""
                clearText="Clear"
                confirmText="Save Signature"
                webStyle={`
                  .m-signature-pad {
                    box-shadow: none;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                  }
                  .m-signature-pad--body {
                    border: none;
                  }
                  .m-signature-pad--footer {
                    display: none;
                  }
                `}
                autoClear={false}
                imageType="image/png"
                dataURL="base64"
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSignatureModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => signatureRef.current?.readSignature()}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.modalSaveText}>Save Signature</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Inspection</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  dateText: {
    fontSize: 14,
    color: '#5bbcbe',
    marginTop: 8,
  },
  section: {
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  allYesButton: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  allYesText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  switchLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  checkItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    paddingRight: 12,
  },
  checkButtons: {
    flexDirection: 'row',
  },
  checkButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1,
  },
  yesButton: {
    borderColor: '#4CAF50',
    backgroundColor: '#fff',
  },
  yesButtonActive: {
    backgroundColor: '#4CAF50',
  },
  noButton: {
    borderColor: '#f44336',
    backgroundColor: '#fff',
  },
  noButtonActive: {
    backgroundColor: '#f44336',
  },
  checkButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  checkButtonTextActive: {
    color: '#fff',
  },
  attestationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5bbcbe',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  completedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  completedInfo: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginVertical: 4,
  },
  backButton: {
    marginTop: 24,
    backgroundColor: '#5bbcbe',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Signature styles
  signatureHelpText: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    lineHeight: 18,
  },
  signatureButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  signatureOptionButton: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  signatureOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e8f7f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  signatureOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  signatureOptionSubtext: {
    fontSize: 12,
    color: '#888',
  },
  signaturePreviewContainer: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  signaturePreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  clearSignatureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
  },
  clearSignatureText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClearButton: {
    padding: 4,
  },
  modalClearText: {
    fontSize: 16,
    color: BRAND_COLOR,
    fontWeight: '600',
  },
  signatureCanvasContainer: {
    flex: 1,
    padding: 16,
  },
  signatureInstructions: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSaveButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 10,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
});
