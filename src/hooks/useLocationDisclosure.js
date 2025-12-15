import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DISCLOSURE_ACCEPTED_KEY = '@cct_driver_location_disclosure_accepted';

/**
 * Hook to manage the prominent disclosure consent state
 * Required for Google Play's User Data policy compliance
 */
export const useLocationDisclosure = () => {
  const [hasAcceptedDisclosure, setHasAcceptedDisclosure] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has previously accepted the disclosure
  useEffect(() => {
    const checkDisclosureStatus = async () => {
      try {
        const accepted = await AsyncStorage.getItem(DISCLOSURE_ACCEPTED_KEY);
        setHasAcceptedDisclosure(accepted === 'true');
      } catch (error) {
        console.error('Error checking disclosure status:', error);
        // Default to not accepted if there's an error
        setHasAcceptedDisclosure(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkDisclosureStatus();
  }, []);

  // Save acceptance to persistent storage
  const acceptDisclosure = useCallback(async () => {
    try {
      await AsyncStorage.setItem(DISCLOSURE_ACCEPTED_KEY, 'true');
      setHasAcceptedDisclosure(true);
      return true;
    } catch (error) {
      console.error('Error saving disclosure acceptance:', error);
      return false;
    }
  }, []);

  // Reset disclosure (for testing or if user wants to review again)
  const resetDisclosure = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(DISCLOSURE_ACCEPTED_KEY);
      setHasAcceptedDisclosure(false);
      return true;
    } catch (error) {
      console.error('Error resetting disclosure:', error);
      return false;
    }
  }, []);

  return {
    hasAcceptedDisclosure,
    isLoading,
    acceptDisclosure,
    resetDisclosure,
  };
};
