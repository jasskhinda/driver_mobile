-- Create driver_location table for GPS tracking
CREATE TABLE IF NOT EXISTS driver_location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_driver_location_trip_id ON driver_location(trip_id);
CREATE INDEX IF NOT EXISTS idx_driver_location_driver_id ON driver_location(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_location_timestamp ON driver_location(timestamp DESC);

-- Enable Row Level Security
ALTER TABLE driver_location ENABLE ROW LEVEL SECURITY;

-- Policy: Drivers can insert their own location
CREATE POLICY driver_location_insert_own ON driver_location
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = driver_id);

-- Policy: Drivers can read their own location
CREATE POLICY driver_location_select_own ON driver_location
  FOR SELECT
  TO authenticated
  USING (auth.uid() = driver_id);

-- Policy: Dispatchers and admins can read all locations
CREATE POLICY driver_location_select_dispatcher_admin ON driver_location
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('dispatcher', 'admin')
    )
  );

-- Policy: Clients can see location for their trips
CREATE POLICY driver_location_select_trip_client ON driver_location
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = driver_location.trip_id
      AND trips.user_id = auth.uid()
    )
  );

-- Policy: Facility users can see location for their managed clients' trips
-- Note: Removed as per requirement - only dispatcher_mobile needs tracking view
-- Facility web app doesn't need live tracking access

-- Create a function to clean up old location data (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_driver_locations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM driver_location
  WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-driver-locations', '0 2 * * *', 'SELECT cleanup_old_driver_locations()');
