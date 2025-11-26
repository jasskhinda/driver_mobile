require('dotenv').config({ path: '../dispatcher_mobile/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkTripData() {
  const tripId = process.argv[2] || 'ab647e3d-1eb0-4c49-8f5d-e0bf7ca05b14';

  console.log(`\n🔍 Checking trip data for: ${tripId}\n`);

  // Get trip
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (tripError) {
    console.error('❌ Error fetching trip:', tripError.message);
    return;
  }

  console.log('📋 Trip Data:');
  console.log('  - user_id:', trip.user_id);
  console.log('  - managed_client_id:', trip.managed_client_id);
  console.log('  - facility_id:', trip.facility_id);
  console.log('  - booked_by:', trip.booked_by);
  console.log('  - pickup_address:', trip.pickup_address);
  console.log('  - destination_address:', trip.destination_address);
  console.log('  - status:', trip.status);

  // Check for managed client
  if (trip.managed_client_id) {
    console.log('\n👥 Fetching managed client data...');
    const { data: managedClient, error: mcError } = await supabase
      .from('facility_managed_clients')
      .select('first_name, last_name, phone_number')
      .eq('id', trip.managed_client_id)
      .single();

    if (mcError) {
      console.error('❌ Error fetching managed client:', mcError.message);
    } else {
      console.log('  ✅ Managed Client:', managedClient.first_name, managedClient.last_name, `(${managedClient.phone_number || 'no phone'})`);
    }
  }

  // Check for user profile
  if (trip.user_id) {
    console.log('\n👤 Fetching user profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, phone')
      .eq('id', trip.user_id)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError.message);
    } else {
      console.log('  ✅ Profile:', profile.first_name, profile.last_name, `(${profile.email})`);
    }
  }

  console.log('\n');
}

checkTripData();
