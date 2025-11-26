# Driver App Notifications Setup

This guide explains how to set up push notifications for the driver mobile app.

## Overview

The driver app uses the **unified notification system** that is shared across all CCT mobile apps (booking, facility, driver, dispatcher). This means:

- ✅ All apps use the same `push_tokens` and `notifications` tables
- ✅ No conflicts between apps
- ✅ Easy to maintain and extend
- ✅ Notifications work for all driver events

## Notification Events

The driver app sends notifications for these events:

### Driver Receives Notifications:
1. **Trip Assigned** - When a dispatcher assigns a trip to the driver
2. **Trip Cancelled** - When a dispatcher cancels a trip
3. **Trip Updated** - When trip details are modified
4. **Trip Completed** - Confirmation after driver completes a trip

### Dispatcher Receives Notifications:
1. **Driver Accepted** - When driver accepts a trip assignment
2. **Driver Rejected** - When driver rejects a trip assignment
3. **Trip Started** - When driver starts the trip (in_progress status)
4. **Trip Completed** - When driver marks trip as completed

### Client/Facility Receives Notifications:
1. **Driver Accepted** - When driver confirms they'll handle the trip
2. **Trip In Progress** - When driver starts the trip

## Database Setup

### Step 1: Run the Unified Notifications Setup (if not already done)

```sql
-- Run this FIRST if you haven't already set up notifications for booking/facility apps
-- File: /booking_mobile/db/notifications_setup_UNIFIED.sql
```

This creates:
- `push_tokens` table (for all apps)
- `notifications` table (for all apps)
- Helper functions
- Row Level Security policies

### Step 2: Run the Driver Notifications Setup

```bash
# In Supabase SQL Editor, run:
# File: /driver_mobile/db/driver_notifications_setup.sql
```

This creates:
- `notify_driver_trip_events()` function - Handles all driver notification logic
- Database triggers for automatic notifications
- Helper function for manual trip assignment notifications

## How It Works

### Automatic Notifications (Database Triggers)

The system automatically sends notifications when:

1. **Trip Assigned to Driver**
   - Trigger: `driver_id` changes from NULL to a driver's ID
   - Notification sent to: Driver

2. **Driver Accepts Trip**
   - Trigger: `driver_acceptance_status` changes to 'accepted'
   - Notifications sent to: Dispatcher, Facility (if applicable), Client (if applicable)

3. **Driver Rejects Trip**
   - Trigger: `driver_acceptance_status` changes to 'rejected'
   - Notification sent to: Dispatcher

4. **Trip Starts (In Progress)**
   - Trigger: `status` changes to 'in_progress'
   - Notification sent to: Dispatcher

5. **Trip Completes**
   - Trigger: `status` changes to 'completed'
   - Notifications sent to: Dispatcher, Driver

### Manual Notifications (For Testing)

You can manually send a trip assignment notification:

```sql
SELECT send_trip_assignment_notification('<trip_id>');
```

## Mobile App Setup

The driver mobile app is already configured with:

1. **Notification Services** (`src/services/notifications.js`)
   - Push notification registration
   - Local notification scheduling
   - Badge management

2. **Notification Hook** (`src/hooks/useNotifications.js`)
   - Real-time Supabase subscriptions
   - Automatic notification display
   - Background notification handling

3. **App Integration** (`App.js`)
   - Notifications enabled on user login
   - Proper AuthProvider wrapping

## Testing the System

### Test 1: Trip Assignment Notification

```bash
# 1. Find a driver's ID
SELECT id, first_name, last_name FROM profiles WHERE role = 'driver' LIMIT 1;

# 2. Find an active trip
SELECT id, pickup_address FROM trips WHERE status = 'confirmed' LIMIT 1;

# 3. Assign trip to driver (triggers automatic notification)
UPDATE trips
SET driver_id = '<driver_id>'
WHERE id = '<trip_id>';

# 4. Check notifications table
SELECT * FROM notifications
WHERE user_id = '<driver_id>'
AND app_type = 'driver'
ORDER BY created_at DESC
LIMIT 5;
```

### Test 2: Driver Acceptance Notification

```bash
# In driver app, accept a trip
# This will trigger notifications to dispatcher

# Check dispatcher notifications
SELECT * FROM notifications
WHERE app_type = 'dispatcher'
AND notification_type = 'driver_accepted'
ORDER BY created_at DESC
LIMIT 5;
```

### Test 3: Trip Completion Notification

```bash
# In driver app, complete a trip
# This will trigger notifications to both driver and dispatcher

# Check notifications
SELECT * FROM notifications
WHERE notification_type = 'trip_completed'
ORDER BY created_at DESC
LIMIT 5;
```

## Viewing Notifications

### Query All Driver Notifications
```sql
SELECT
  n.id,
  n.title,
  n.body,
  n.notification_type,
  n.read,
  n.created_at,
  p.first_name,
  p.last_name,
  p.email
FROM notifications n
JOIN profiles p ON n.user_id = p.id
WHERE n.app_type = 'driver'
ORDER BY n.created_at DESC
LIMIT 10;
```

### Query Notifications By Trip
```sql
SELECT *
FROM notifications
WHERE data->>'tripId' = '<trip_id>'
ORDER BY created_at ASC;
```

### Check Push Tokens
```sql
SELECT
  pt.user_id,
  pt.app_type,
  pt.platform,
  pt.created_at,
  p.first_name,
  p.last_name,
  p.role
FROM push_tokens pt
JOIN profiles p ON pt.user_id = p.id
WHERE pt.app_type = 'driver';
```

## Troubleshooting

### Issue: Driver not receiving notifications

1. **Check if push token is saved**
   ```sql
   SELECT * FROM push_tokens WHERE user_id = '<driver_id>' AND app_type = 'driver';
   ```

2. **Check if notifications are being created**
   ```sql
   SELECT * FROM notifications WHERE user_id = '<driver_id>' AND app_type = 'driver' ORDER BY created_at DESC LIMIT 5;
   ```

3. **Check real-time subscription status**
   - Look for console logs in the driver app
   - Should see: "✅ Notification monitoring ACTIVE"

4. **Check notification permissions**
   - iOS: Settings → Driver App → Notifications
   - Android: Settings → Apps → Driver App → Notifications

### Issue: Dispatcher not receiving driver acceptance notifications

1. **Check if dispatcher profile has role='dispatcher'**
   ```sql
   SELECT id, email, role FROM profiles WHERE role = 'dispatcher';
   ```

2. **Check if notifications were created**
   ```sql
   SELECT * FROM notifications
   WHERE app_type = 'dispatcher'
   AND notification_type = 'driver_accepted'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

### Issue: Notifications working in app but not when app is closed

- This requires EAS Build with proper push notification credentials
- Expo Go has limitations with background push notifications
- Build a development build or production build to test background notifications

## Important Notes

1. **Safe for Multi-App Environment**
   - All database changes are additive (no modifications to existing tables)
   - Trigger only READS from trips table
   - No conflicts with booking/facility app notifications

2. **Real-Time Updates**
   - Uses Supabase real-time subscriptions
   - Notifications appear instantly when app is open
   - Background notifications require native build (not Expo Go)

3. **Badge Management**
   - Badge count shows unread notifications
   - Automatically updates when notifications are read

4. **Data Privacy**
   - Row Level Security ensures users only see their own notifications
   - Push tokens are user-specific
   - Secure by default

## Next Steps

1. ✅ Run both SQL setup scripts in Supabase
2. ✅ Restart driver mobile app
3. ✅ Log in as a driver
4. ✅ Test trip assignment from dispatcher app
5. ✅ Verify notifications appear on driver's device
6. ✅ Test driver acceptance notification to dispatcher

## Additional Resources

- Expo Notifications Documentation: https://docs.expo.dev/versions/latest/sdk/notifications/
- Supabase Real-time Documentation: https://supabase.com/docs/guides/realtime
- PostgreSQL Triggers: https://www.postgresql.org/docs/current/sql-createtrigger.html
