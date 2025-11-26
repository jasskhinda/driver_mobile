-- =============================================
-- DRIVER APP NOTIFICATIONS SETUP
-- =============================================
-- This extends the unified notification system for driver app
-- Adds notification triggers for:
-- 1. Trip assigned to driver
-- 2. Driver accepts/rejects trip
-- 3. Driver starts trip
-- 4. Driver completes trip
--
-- ✅ SAFE: Uses existing tables (push_tokens, notifications)
-- ✅ Works with booking, facility, dispatcher apps
-- =============================================

-- =============================================
-- DRIVER TRIP NOTIFICATIONS FUNCTION
-- =============================================
-- Sends notifications to driver AND dispatcher when trip events occur

CREATE OR REPLACE FUNCTION notify_driver_trip_events()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_body TEXT;
  driver_notification_title TEXT;
  driver_notification_body TEXT;
  dispatcher_user_ids UUID[];
  dispatcher_id UUID;
  pickup_address_short TEXT;
  client_name TEXT;
BEGIN
  -- Get short version of pickup address (first part before comma)
  pickup_address_short := split_part(NEW.pickup_address, ',', 1);

  -- Get client name for notifications
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

  -- ========================================
  -- SCENARIO 1: Trip assigned to driver
  -- ========================================
  IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL THEN
    -- Notify driver of new assignment
    INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
    VALUES (
      NEW.driver_id,
      'driver',
      'trip_assigned',
      '🚗 New Trip Assigned',
      'You have been assigned a trip to ' || pickup_address_short || ' for ' || client_name,
      jsonb_build_object(
        'tripId', NEW.id,
        'pickupTime', NEW.pickup_time,
        'pickupAddress', NEW.pickup_address,
        'destinationAddress', NEW.destination_address,
        'status', NEW.status
      )
    );

    RAISE NOTICE 'Driver % notified of trip assignment %', NEW.driver_id, NEW.id;
  END IF;

  -- ========================================
  -- SCENARIO 2: Driver accepts trip
  -- ========================================
  IF OLD.driver_acceptance_status != 'accepted' AND NEW.driver_acceptance_status = 'accepted' THEN
    -- Get all dispatcher users
    SELECT ARRAY_AGG(DISTINCT id) INTO dispatcher_user_ids
    FROM profiles
    WHERE role = 'dispatcher';

    -- Notify each dispatcher
    IF dispatcher_user_ids IS NOT NULL THEN
      FOREACH dispatcher_id IN ARRAY dispatcher_user_ids
      LOOP
        INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
        VALUES (
          dispatcher_id,
          'dispatcher',
          'driver_accepted',
          '✅ Driver Accepted Trip',
          'Driver accepted trip for ' || client_name || ' to ' || pickup_address_short,
          jsonb_build_object(
            'tripId', NEW.id,
            'driverId', NEW.driver_id,
            'pickupAddress', NEW.pickup_address,
            'status', NEW.status
          )
        );
      END LOOP;

      RAISE NOTICE 'Dispatchers notified of driver acceptance for trip %', NEW.id;
    END IF;

    -- Also notify facility if trip was booked by facility
    IF NEW.facility_id IS NOT NULL AND NEW.booked_by IS NOT NULL THEN
      INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
      VALUES (
        NEW.booked_by,
        'facility',
        'driver_accepted',
        '✅ Driver Accepted Trip',
        'Driver accepted trip for ' || client_name,
        jsonb_build_object(
          'tripId', NEW.id,
          'facilityId', NEW.facility_id,
          'managedClientId', NEW.managed_client_id
        )
      );
    END IF;

    -- Notify booking client if applicable
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
      VALUES (
        NEW.user_id,
        'booking',
        'driver_accepted',
        '✅ Driver Confirmed',
        'Your driver has confirmed and is getting ready!',
        jsonb_build_object(
          'tripId', NEW.id,
          'status', NEW.status
        )
      );
    END IF;
  END IF;

  -- ========================================
  -- SCENARIO 3: Driver starts trip (in_progress)
  -- ========================================
  IF OLD.status != 'in_progress' AND NEW.status = 'in_progress' THEN
    -- Get all dispatcher users
    SELECT ARRAY_AGG(DISTINCT id) INTO dispatcher_user_ids
    FROM profiles
    WHERE role = 'dispatcher';

    -- Notify each dispatcher
    IF dispatcher_user_ids IS NOT NULL THEN
      FOREACH dispatcher_id IN ARRAY dispatcher_user_ids
      LOOP
        INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
        VALUES (
          dispatcher_id,
          'dispatcher',
          'trip_started',
          '🛣️ Trip Started',
          'Driver started trip for ' || client_name || ' to ' || pickup_address_short,
          jsonb_build_object(
            'tripId', NEW.id,
            'driverId', NEW.driver_id,
            'status', NEW.status
          )
        );
      END LOOP;
    END IF;
  END IF;

  -- ========================================
  -- SCENARIO 4: Driver completes trip
  -- ========================================
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    -- Get all dispatcher users
    SELECT ARRAY_AGG(DISTINCT id) INTO dispatcher_user_ids
    FROM profiles
    WHERE role = 'dispatcher';

    -- Notify each dispatcher
    IF dispatcher_user_ids IS NOT NULL THEN
      FOREACH dispatcher_id IN ARRAY dispatcher_user_ids
      LOOP
        INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
        VALUES (
          dispatcher_id,
          'dispatcher',
          'trip_completed',
          '✅ Trip Completed',
          'Driver completed trip for ' || client_name,
          jsonb_build_object(
            'tripId', NEW.id,
            'driverId', NEW.driver_id,
            'status', NEW.status
          )
        );
      END LOOP;

      RAISE NOTICE 'Dispatchers notified of trip completion %', NEW.id;
    END IF;

    -- Notify driver of completion
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
      VALUES (
        NEW.driver_id,
        'driver',
        'trip_completed',
        '✅ Trip Completed',
        'Great job! Trip for ' || client_name || ' completed successfully.',
        jsonb_build_object(
          'tripId', NEW.id,
          'status', NEW.status
        )
      );
    END IF;
  END IF;

  -- ========================================
  -- SCENARIO 5: Driver rejects/cancels trip
  -- ========================================
  IF OLD.driver_acceptance_status != 'rejected' AND NEW.driver_acceptance_status = 'rejected' THEN
    -- Get all dispatcher users
    SELECT ARRAY_AGG(DISTINCT id) INTO dispatcher_user_ids
    FROM profiles
    WHERE role = 'dispatcher';

    -- Notify each dispatcher
    IF dispatcher_user_ids IS NOT NULL THEN
      FOREACH dispatcher_id IN ARRAY dispatcher_user_ids
      LOOP
        INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
        VALUES (
          dispatcher_id,
          'dispatcher',
          'driver_rejected',
          '❌ Driver Rejected Trip',
          'Driver rejected trip for ' || client_name || ' to ' || pickup_address_short,
          jsonb_build_object(
            'tripId', NEW.id,
            'driverId', NEW.driver_id,
            'pickupAddress', NEW.pickup_address,
            'status', NEW.status
          )
        );
      END LOOP;

      RAISE NOTICE 'Dispatchers notified of driver rejection for trip %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for driver trip events
DROP TRIGGER IF EXISTS trigger_notify_driver_trip_events ON trips;
CREATE TRIGGER trigger_notify_driver_trip_events
  AFTER UPDATE ON trips
  FOR EACH ROW
  EXECUTE FUNCTION notify_driver_trip_events();

-- =============================================
-- HELPER FUNCTION: Manual trip assignment notification
-- =============================================
-- Use this to manually send notification when trip is assigned via dispatcher app
CREATE OR REPLACE FUNCTION send_trip_assignment_notification(p_trip_id UUID)
RETURNS VOID AS $$
DECLARE
  v_trip RECORD;
  pickup_short TEXT;
  client_name TEXT;
BEGIN
  -- Get trip details
  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;

  IF v_trip.driver_id IS NULL THEN
    RAISE EXCEPTION 'Trip has no driver assigned';
  END IF;

  pickup_short := split_part(v_trip.pickup_address, ',', 1);

  -- Get client name
  IF v_trip.managed_client_id IS NOT NULL THEN
    SELECT CONCAT(first_name, ' ', last_name) INTO client_name
    FROM facility_managed_clients
    WHERE id = v_trip.managed_client_id;
  ELSIF v_trip.user_id IS NOT NULL THEN
    SELECT COALESCE(CONCAT(first_name, ' ', last_name), email) INTO client_name
    FROM profiles
    WHERE id = v_trip.user_id;
  END IF;

  client_name := COALESCE(client_name, 'Client');

  -- Send notification to driver
  INSERT INTO notifications (user_id, app_type, notification_type, title, body, data)
  VALUES (
    v_trip.driver_id,
    'driver',
    'trip_assigned',
    '🚗 New Trip Assigned',
    'You have been assigned a trip to ' || pickup_short || ' for ' || client_name,
    jsonb_build_object(
      'tripId', v_trip.id,
      'pickupTime', v_trip.pickup_time,
      'pickupAddress', v_trip.pickup_address,
      'destinationAddress', v_trip.destination_address,
      'status', v_trip.status
    )
  );

  RAISE NOTICE 'Manual trip assignment notification sent to driver % for trip %', v_trip.driver_id, p_trip_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SETUP COMPLETE!
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ ✅ ✅ DRIVER NOTIFICATIONS SETUP COMPLETE! ✅ ✅ ✅';
  RAISE NOTICE '';
  RAISE NOTICE '📱 What was added:';
  RAISE NOTICE '   • notify_driver_trip_events() function';
  RAISE NOTICE '   • Trigger on trips table for driver events';
  RAISE NOTICE '   • Manual assignment notification helper';
  RAISE NOTICE '';
  RAISE NOTICE '🔔 Notification Events:';
  RAISE NOTICE '   1. Trip assigned → Driver gets notification';
  RAISE NOTICE '   2. Driver accepts → Dispatcher + Facility + Client notified';
  RAISE NOTICE '   3. Driver rejects → Dispatcher notified';
  RAISE NOTICE '   4. Trip started → Dispatcher notified';
  RAISE NOTICE '   5. Trip completed → Dispatcher + Driver notified';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Safety:';
  RAISE NOTICE '   ✅ Uses existing tables (no new tables created)';
  RAISE NOTICE '   ✅ Works alongside booking/facility notifications';
  RAISE NOTICE '   ✅ No conflicts with existing triggers';
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test Manual Notification:';
  RAISE NOTICE '   SELECT send_trip_assignment_notification(''<trip_id>'');';
  RAISE NOTICE '';
END $$;
