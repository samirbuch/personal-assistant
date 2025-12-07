// Import Supabase via CDN (if using type="module" in HTML)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/+esm";
// v2.86.0 is the last working version in the browser

// Replace these with your Supabase project info

const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eGxiY3lwc2J5cm91bnJ5cHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzg5NTMsImV4cCI6MjA3ODQ1NDk1M30.1RyEMa9tCiWMWCH0EDN4uGQ5dS_mcmBhUFekuSeGfWw";

const supabaseUrl = "https://zyxlbcypsbyrounrypsy.supabase.co";

export const supabase = createClient(supabaseUrl, supabaseKey);
console.log("Supabase client:", supabase);

export async function getProfile(userID) {
  const { data, error } = await supabase
    .from("User")
    .select("*")
    .eq("user_id", userID)
    .single();

  if (error) {
    console.error("Error getting profile:", error);
    return null;
  }

  return data;
}

// const { data, error } = await supabase
//     .from('to-be-scheduled')
//     .insert([{ appointment_type: "test appointment",
//         zip_code:"19121",
//         start_time:"10:00",
//         end_time:"11:00",
//         preferred_date:"2024-06-10",
//      }])
//     .select();

// console.log(data);
// console.log(error);
