require('dotenv').config({ path: '../dispatcher_mobile/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkUpcomingTrips() {
  console.log('\n🔍 Checking upcoming trips with client info...\n');

  // Get upcoming trips
  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'upcoming')
    .order('pickup_time', { ascending: true })
    .limit(5);

  if (error) {
    console.error('❌ Error fetching trips:', error.message);
    return;
  }

  console.log(`Found ${trips.length} upcoming trips:\n`);

  for (const trip of trips) {
    console.log('─────────────────────────────────────────');
    console.log(`Trip ID: ${trip.id}`);
    console.log(`Pickup: ${trip.pickup_address}`);
    console.log(`Status: ${trip.status}`);
    console.log(`user_id: ${trip.user_id || 'NULL'}`);
    console.log(`managed_client_id: ${trip.managed_client_id || 'NULL'}`);
    console.log(`facility_id: ${trip.facility_id || 'NULL'}`);

    // Check for managed client
    if (trip.managed_client_id) {
      const { data: client } = await supabase
        .from('facility_managed_clients')
        .select('first_name, last_name, phone_number')
        .eq('id', trip.managed_client_id)
        .single();

      if (client) {
        console.log(`✅ Facility Client: ${client.first_name} ${client.last_name}`);
      }
    }

    // Check for booking user
    if (trip.user_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, phone')
        .eq('id', trip.user_id)
        .single();

      if (profileError) {
        console.log(`❌ Profile Error: ${profileError.message}`);
      } else if (profile) {
        const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        console.log(`✅ Booking Client: ${name || profile.email}`);
      } else {
        console.log(`⚠️ No profile found for user_id: ${trip.user_id}`);
      }
    }

    if (!trip.user_id && !trip.managed_client_id) {
      console.log('⚠️ No client information available');
    }

    console.log('');
  }

  console.log('─────────────────────────────────────────\n');
}

checkUpcomingTrips();
