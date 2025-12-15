import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const ShiftContext = createContext({});

export const useShift = () => useContext(ShiftContext);

export const ShiftProvider = ({ children }) => {
  const { user } = useAuth();
  const [currentShift, setCurrentShift] = useState(null);
  const [todayInspection, setTodayInspection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for active shift on mount
  const checkActiveShift = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get active shift (clocked in but not clocked out)
      const { data: shift, error: shiftError } = await supabase
        .from('driver_shifts')
        .select('*')
        .eq('driver_id', user.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shiftError) throw shiftError;
      setCurrentShift(shift);

      // Check for today's inspection (using existing vehicle_checkoffs table)
      const today = new Date().toISOString().split('T')[0];
      const { data: inspection, error: inspError } = await supabase
        .from('vehicle_checkoffs')
        .select('*')
        .eq('driver_id', user.id)
        .eq('checkoff_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inspError && inspError.code !== 'PGRST116') throw inspError;
      setTodayInspection(inspection);

    } catch (err) {
      console.error('Error checking shift:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    checkActiveShift();
  }, [checkActiveShift]);

  // Clock In
  const clockIn = async (vehicleId, odometerStart) => {
    if (!user?.id) throw new Error('Not authenticated');

    try {
      const { data, error } = await supabase
        .from('driver_shifts')
        .insert({
          driver_id: user.id,
          vehicle_id: vehicleId,
          odometer_start: odometerStart,
          clock_in: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setCurrentShift(data);
      return data;
    } catch (err) {
      console.error('Clock in error:', err);
      throw err;
    }
  };

  // Clock Out
  const clockOut = async (odometerEnd, notes) => {
    if (!currentShift?.id) throw new Error('No active shift');

    try {
      const { data, error } = await supabase
        .from('driver_shifts')
        .update({
          clock_out: new Date().toISOString(),
          odometer_end: odometerEnd,
          notes: notes,
        })
        .eq('id', currentShift.id)
        .select()
        .single();

      if (error) throw error;
      setCurrentShift(null);
      return data;
    } catch (err) {
      console.error('Clock out error:', err);
      throw err;
    }
  };

  // Upload signature image to Supabase Storage
  const uploadSignatureImage = async (base64Image) => {
    if (!user?.id) throw new Error('Not authenticated');

    try {
      // Remove the data:image/png;base64, prefix if present
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${user.id}/${timestamp}-signature.png`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('signatures')
        .upload(fileName, bytes.buffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (error) throw error;

      // Get the public URL (or signed URL for private bucket)
      const { data: urlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName);

      return urlData.publicUrl || fileName;
    } catch (err) {
      console.error('Upload signature error:', err);
      throw err;
    }
  };

  // Save vehicle inspection (uses existing vehicle_checkoffs table)
  const saveInspection = async (inspectionData) => {
    if (!user?.id) throw new Error('Not authenticated');

    try {
      let signatureUrl = null;

      // Upload signature image if provided
      if (inspectionData.signature_image) {
        signatureUrl = await uploadSignatureImage(inspectionData.signature_image);
      }

      // Remove base64 from data, replace with URL
      const { signature_image, ...restData } = inspectionData;

      const { data, error } = await supabase
        .from('vehicle_checkoffs')
        .insert({
          driver_id: user.id,
          shift_id: currentShift?.id,
          ...restData,
          signature_image: signatureUrl,
          checkoff_date: new Date().toISOString().split('T')[0],
          signed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setTodayInspection(data);
      return data;
    } catch (err) {
      console.error('Save inspection error:', err);
      throw err;
    }
  };

  // Get shift history
  const getShiftHistory = async (limit = 30) => {
    if (!user?.id) return [];

    try {
      const { data, error } = await supabase
        .from('driver_shifts')
        .select('*')
        .eq('driver_id', user.id)
        .order('clock_in', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Get shift history error:', err);
      return [];
    }
  };

  // Check if inspection is required (no inspection today)
  const inspectionRequired = !todayInspection;

  // Check if clocked in
  const isClockedIn = !!currentShift;

  const value = {
    currentShift,
    todayInspection,
    loading,
    error,
    isClockedIn,
    inspectionRequired,
    clockIn,
    clockOut,
    saveInspection,
    getShiftHistory,
    refreshShift: checkActiveShift,
  };

  return (
    <ShiftContext.Provider value={value}>
      {children}
    </ShiftContext.Provider>
  );
};
