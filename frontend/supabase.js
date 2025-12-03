// import 'dotenv/config' haven't figured out dotenv

// Import Supabase via CDN (if using type="module" in HTML)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
// import { en } from 'zod/locales';

// Replace these with your Supabase project info

const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5eGxiY3lwc2J5cm91bnJ5cHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4Nzg5NTMsImV4cCI6MjA3ODQ1NDk1M30.1RyEMa9tCiWMWCH0EDN4uGQ5dS_mcmBhUFekuSeGfWw'

const supabaseUrl = 'https://zyxlbcypsbyrounrypsy.supabase.co';
;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchTest() {
    const { data, error } = await supabase.from("test").select("*");
    if (error) {
        console.error('Error fetching data:', error);
    } else {
        console.log('Data:', data);
    }
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


const { data, error } = await supabase
  .from('cities')
  .select();


  console.log(data);
// let formDataHTML = document.querySelector("#appointment-form");
// let formData = new FormData(formDataHTML);

// console.log(formData);

// console.log(data);
// console.log(error);

fetchTest();