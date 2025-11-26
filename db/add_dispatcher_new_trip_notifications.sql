-- =============================================
-- ADD DISPATCHER NOTIFICATIONS FOR NEW TRIPS
-- =============================================
-- This updates the existing notification system to notify
-- dispatchers when new trips are created from booking app
-- =============================================

-- Update the existing notify_trip_status_change function to include dispatchers
CREATE OR REPLACE FUNCTION notify_trip_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_body TEXT;
  target_user_id UUID;
  target_facility_user_id UUID;
  dispatcher_user_ids UUID[];
  dispatcher_id UUID;
  client_name TEXT;
  pickup_address_short TEXT;
BEGIN
  -- Only send notification if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN

    -- Get client name for dispatcher notifications
    IF NEW.managed_client_id IS NOT NULL THEN
      SELECT CONCAT(first_name, ' ', last_name) INTO client_name
      FROM facility_managed_clients
      WHERE id = NEW.managed_client_id;
    ELSIF NEW.user_id IS NOT NULL THEN
      SELECT COALESCE(CONCAT(first_name, ' ', last_name), email) INTO client_name
      FROM profiles
      WHERE id = NEW.user_id;
    END IF;

    client_name := COALESCE(client_name, 'Client');
    pickup_address_short := split_part(NEW.pickup_address, ',', 1);

    -- Determine notification message based on status
    CASE NEW.status
      WHEN 'pending' THEN
        notification_title := '🚗 Trip Booked!';
        notification_body := 'Your trip has been submitted and is pending approval.';
      WHEN 'confirmed', 'approved' THEN
        notification_title := '✅ Trip Confirmed';
        notification_body := 'Your trip has been confirmed and scheduled!';
      WHEN 'assigned' THEN
        notification_title := '🚗 Driver Assigned';
        notification_body := 'A driver has been assigned to your trip.';
      WHEN 'in-progress', 'in_progress' THEN
        notification_title := '🛣️ Trip In Progress';
        notification_body := 'Your trip is now in progress. Driver is on the way!';
      WHEN 'completed' THEN
        notification_title := '✅ Trip Completed';
        notification_body := 'Your trip has been completed. Thank you for using our service!';
      WHEN 'cancelled' THEN
        notification_title := '❌ Trip Cancelled';
        notification_body := 'Your trip has been cancelled.';
      WHEN 'rejected' THEN
        notification_title := '❌ Trip Request Denied';
        notification_body := 'Unfortunately, your trip request could not be accommodated at this time.';
      ELSE
        notification_title := 'Trip Update';
        notification_body := 'Your trip status has been updated.';
    END CASE;

    -- 1. Send notification to CLIENT (if authenticated user, not managed client)
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
      VALUES (
        NEW.user_id,
        'booking',
        'trip_update',
        notification_title,
        notification_body,
        jsonb_build_object(
          'tripId', NEW.id,
          'status', NEW.status,
          'pickupTime', NEW.pickup_time,
          'pickupAddress', NEW.pickup_address
        )
      );

      RAISE NOTICE 'Booking notification sent to user % for trip %', NEW.user_id, NEW.id;
    END IF;

    -- 2. Send notification to FACILITY (if trip was booked by facility)
    IF NEW.facility_id IS NOT NULL AND NEW.booked_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
      VALUES (
        NEW.booked_by,
        'facility',
        'trip_update',
        notification_title || ' (Facility)',
        'Trip status updated: ' || notification_body,
        jsonb_build_object(
          'tripId', NEW.id,
          'status', NEW.status,
          'facilityId', NEW.facility_id,
          'managedClientId', NEW.managed_client_id
        )
      );

      RAISE NOTICE 'Facility notification sent to user % for trip %', NEW.booked_by, NEW.id;
    END IF;

    -- 3. Send notification to ALL DISPATCHERS for new pending trips
    IF NEW.status = 'pending' THEN
      -- Get all dispatcher users
      SELECT ARRAY_AGG(DISTINCT id) INTO dispatcher_user_ids
      FROM profiles
      WHERE role = 'dispatcher';

      IF dispatcher_user_ids IS NOT NULL THEN
        FOREACH dispatcher_id IN ARRAY dispatcher_user_ids
        LOOP
          INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
          VALUES (
            dispatcher_id,
            'dispatcher',
            'new_trip',
            '🚗 New Trip Request',
            'New trip request from ' || client_name || ' to ' || pickup_address_short,
            jsonb_build_object(
              'tripId', NEW.id,
              'clientName', client_name,
              'pickupTime', NEW.pickup_time,
              'pickupAddress', NEW.pickup_address,
              'destinationAddress', NEW.destination_address,
              'status', NEW.status
            )
          );
        END LOOP;

        RAISE NOTICE 'Dispatcher notifications sent to % dispatchers for new trip %', array_length(dispatcher_user_ids, 1), NEW.id;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (it already exists, just recreating to ensure it uses the updated function)
DROP TRIGGER IF EXISTS trigger_notify_trip_status ON trips;
CREATE TRIGGER trigger_notify_trip_status
AFTER UPDATE ON trips
FOR EACH ROW
EXECUTE FUNCTION notify_trip_status_change();

-- ✅ DONE!
-- Now dispatchers will receive notifications when:
-- - New trips are created with status='pending'
-- All other existing functionality remains the same
