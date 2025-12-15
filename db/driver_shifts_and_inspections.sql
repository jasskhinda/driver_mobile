-- ============================================
-- SAFE MIGRATION: Driver Shifts & Enhanced Inspections
-- This script checks for existing tables and won't break other apps
-- ============================================

-- Driver Shifts (Clock In/Out) - NEW TABLE
CREATE TABLE IF NOT EXISTS driver_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_id TEXT,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  total_hours DECIMAL(5,2),
  odometer_start INTEGER,
  odometer_end INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries (only create if not exists)
CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver_id ON driver_shifts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_clock_in ON driver_shifts(clock_in);

-- RLS Policies for driver_shifts
ALTER TABLE driver_shifts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "Drivers can view own shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Drivers can insert own shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Drivers can update own shifts" ON driver_shifts;
DROP POLICY IF EXISTS "Admins can view all shifts" ON driver_shifts;

-- Create policies
CREATE POLICY "Drivers can view own shifts" ON driver_shifts
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own shifts" ON driver_shifts
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own shifts" ON driver_shifts
  FOR UPDATE USING (auth.uid() = driver_id);

CREATE POLICY "Admins can view all shifts" ON driver_shifts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

-- ============================================
-- Vehicle Checkoffs table (create if not exists)
-- Based on driver_app/db/driver_features_update.sql with ODA0008 additions
-- ============================================

CREATE TABLE IF NOT EXISTS vehicle_checkoffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id TEXT,
  checkoff_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Original fields from driver_app
  exterior_condition BOOLEAN DEFAULT FALSE,
  tires_condition BOOLEAN DEFAULT FALSE,
  lights_working BOOLEAN DEFAULT FALSE,
  mirrors_clean BOOLEAN DEFAULT FALSE,
  windshield_clean BOOLEAN DEFAULT FALSE,
  fluid_levels BOOLEAN DEFAULT FALSE,
  brakes_working BOOLEAN DEFAULT FALSE,
  horn_working BOOLEAN DEFAULT FALSE,
  seatbelts_working BOOLEAN DEFAULT FALSE,
  emergency_equipment BOOLEAN DEFAULT FALSE,
  wheelchair_lift_working BOOLEAN DEFAULT FALSE,
  wheelchair_securements BOOLEAN DEFAULT FALSE,
  interior_clean BOOLEAN DEFAULT FALSE,
  seats_clean BOOLEAN DEFAULT FALSE,
  floor_clean BOOLEAN DEFAULT FALSE,
  registration_current BOOLEAN DEFAULT FALSE,
  insurance_current BOOLEAN DEFAULT FALSE,
  inspection_current BOOLEAN DEFAULT FALSE,
  notes TEXT,
  issues_found TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE vehicle_checkoffs ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Drivers can view their own checkoffs" ON vehicle_checkoffs;
DROP POLICY IF EXISTS "Drivers can create their own checkoffs" ON vehicle_checkoffs;
DROP POLICY IF EXISTS "Drivers can update their own checkoffs from today" ON vehicle_checkoffs;
DROP POLICY IF EXISTS "Dispatchers can view all checkoffs" ON vehicle_checkoffs;

CREATE POLICY "Drivers can view their own checkoffs"
ON vehicle_checkoffs FOR SELECT
USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can create their own checkoffs"
ON vehicle_checkoffs FOR INSERT
WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own checkoffs from today"
ON vehicle_checkoffs FOR UPDATE
USING (auth.uid() = driver_id AND checkoff_date = CURRENT_DATE);

CREATE POLICY "Dispatchers can view all checkoffs"
ON vehicle_checkoffs FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('dispatcher', 'admin'))
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_vehicle_checkoffs_driver_date ON vehicle_checkoffs(driver_id, checkoff_date DESC);

-- ============================================
-- Add additional columns for full ODA0008 compliance
-- ============================================

-- Add additional columns to vehicle_checkoffs if they don't exist
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES driver_shifts(id) ON DELETE SET NULL;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS vehicle_vin_last6 TEXT;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS vehicle_make_model TEXT;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS odometer_reading INTEGER;

-- Under the hood items
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS adequate_clean_oil BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS hoses_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS belts_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS washer_fluid_ok BOOLEAN;

-- Items stored in vehicle
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS valid_insurance_card BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS valid_registration BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS biohazard_kit BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS first_aid_kit BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS seatbelt_cutter BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS flares_triangles BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS fire_extinguisher BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS blanket_winter BOOLEAN;

-- Additional interior items
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS floor_free_of_hazards BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS mirrors_adjusted BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS doors_operate_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS door_locks_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS gauges_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS fuel_adequate BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS no_warning_lights BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS communication_device BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS backup_alarm_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS heater_ac_ok BOOLEAN;

-- Lights (additional)
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS headlights_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS tail_lights_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS brake_lights_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS turn_signals_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS backup_lights_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS hazard_lights_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS license_plate_light_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS interior_lights_ok BOOLEAN;

-- Wheelchair lift/ramp (extended)
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS has_wheelchair_lift BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS lift_operates_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS lift_secured BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS lift_restraints_ok BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS lift_no_damage BOOLEAN;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS lift_clean BOOLEAN;

-- Attestation
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS driver_signature TEXT;
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS signature_image TEXT; -- URL to signature image in storage bucket
ALTER TABLE vehicle_checkoffs ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- ============================================
-- Trip Logs (Enhanced per-trip data) - NEW TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trip_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES driver_shifts(id) ON DELETE SET NULL,

  -- Payment/Billing type
  payment_type TEXT CHECK (payment_type IN ('private_pay', 'uzurv', 'facility', 'other')),
  uzurv_cancellation BOOLEAN DEFAULT FALSE,

  -- Facility codes (from the form)
  facility_code TEXT,

  -- Mileage
  mileage_start INTEGER,
  mileage_end INTEGER,

  -- Pickup/Dropoff times
  actual_pickup_time TIMESTAMPTZ,
  actual_dropoff_time TIMESTAMPTZ,

  -- Arrival times at addresses
  arrival_pickup_time TIMESTAMPTZ,
  arrival_dropoff_time TIMESTAMPTZ,

  -- Paperwork
  passenger_had_paperwork BOOLEAN,
  facility_received_paperwork BOOLEAN,
  paperwork_recipient_name TEXT,
  paperwork_recipient_signature TEXT,

  -- Cancellation
  was_cancelled BOOLEAN DEFAULT FALSE,
  cancellation_reason TEXT,

  -- Driver notes
  comments TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trip_logs_trip_id ON trip_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_logs_driver_id ON trip_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_logs_shift_id ON trip_logs(shift_id);

-- RLS Policies for trip_logs
ALTER TABLE trip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view own trip logs" ON trip_logs;
DROP POLICY IF EXISTS "Drivers can insert own trip logs" ON trip_logs;
DROP POLICY IF EXISTS "Drivers can update own trip logs" ON trip_logs;
DROP POLICY IF EXISTS "Admins can view all trip logs" ON trip_logs;

CREATE POLICY "Drivers can view own trip logs" ON trip_logs
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own trip logs" ON trip_logs
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update own trip logs" ON trip_logs
  FOR UPDATE USING (auth.uid() = driver_id);

CREATE POLICY "Admins can view all trip logs" ON trip_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher', 'facility')
    )
  );

-- ============================================
-- Facility Codes Reference Table
-- ============================================
CREATE TABLE IF NOT EXISTS facility_codes (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- Insert the facility codes from the form (won't duplicate if exists)
INSERT INTO facility_codes (code, name) VALUES
  ('SA', 'SA'),
  ('MT', 'MT'),
  ('FH', 'FH'),
  ('TC', 'TC'),
  ('WV', 'WV'),
  ('N', 'N'),
  ('H', 'H'),
  ('MC', 'MC'),
  ('T', 'T'),
  ('G', 'G'),
  ('GH', 'GH'),
  ('FC', 'FC'),
  ('C', 'C'),
  ('FV', 'FV'),
  ('I', 'I')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Function to auto-calculate total hours on clock out
-- ============================================
CREATE OR REPLACE FUNCTION calculate_shift_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND NEW.clock_in IS NOT NULL THEN
    NEW.total_hours := EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS trigger_calculate_shift_hours ON driver_shifts;

CREATE TRIGGER trigger_calculate_shift_hours
  BEFORE UPDATE ON driver_shifts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_shift_hours();

-- ============================================
-- Storage Bucket for Signatures
-- NOTE: Create the bucket via Supabase Dashboard first:
--   1. Go to Storage > Create new bucket
--   2. Name: "signatures"
--   3. Public: No (private)
--   4. File size limit: 5MB
--   5. Allowed MIME types: image/png, image/jpeg
-- ============================================

-- Policy: Drivers can upload their own signatures
DROP POLICY IF EXISTS "Drivers can upload signatures" ON storage.objects;
CREATE POLICY "Drivers can upload signatures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signatures' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Drivers can view their own signatures
DROP POLICY IF EXISTS "Drivers can view own signatures" ON storage.objects;
CREATE POLICY "Drivers can view own signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Admins/Dispatchers can view all signatures
DROP POLICY IF EXISTS "Admins can view all signatures" ON storage.objects;
CREATE POLICY "Admins can view all signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'dispatcher')
  )
);
