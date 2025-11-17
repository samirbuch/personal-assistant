// Import Supabase via CDN (if using type="module" in HTML)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Replace these with your Supabase project info
const supabaseUrl = 'https://zyxlbcypsbyrounrypsy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eGxiY3lwc2J5cm91bnJ5cHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzg5NTMsImV4cCI6MjA3ODQ1NDk1M30.1RyEMa9tCiWMWCH0EDN4uGQ5dS_mcmBhUFekuSeGfWw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchTest() {
    const { data, error } = await supabase.from("test").select("*");
    if (error) {
        console.error('Error fetching data:', error);
    } else {
        console.log('Data:', data);
    }
}

fetchTest();