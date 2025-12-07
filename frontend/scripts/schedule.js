import { supabase } from "./supabase.js";

let endtime = document.getElementById("end-time");
let starttime = document.getElementById("start-time");

function startBeforeEnd(start, end) {
  let [startHours, startMinutes] = start.split(":").map(Number);
  let [endHours, endMinutes] = end.split(":").map(Number);

  console.log(`Start - Hours: ${startHours}, Minutes: ${startMinutes}`);
  console.log(`End - Hours: ${endHours}, Minutes: ${endMinutes}`);

  if (
    startHours > endHours ||
    (startHours === endHours && startMinutes > endMinutes)
  ) {
    return false; // Start time is later than end time
  }
  return true; // Start time is earlier than or equal to end time
}

starttime.addEventListener("change", () => {
  if (!startBeforeEnd(starttime.value, endtime.value)) {
    endtime.value = starttime.value;
    endtime.min = starttime.value;
  }
});

endtime.addEventListener("change", () => {
  if (!startBeforeEnd(starttime.value, endtime.value)) {
    endtime.value = starttime.value;
    endtime.min = starttime.value;
    let end = document.querySelector(".form-entry end");
    console.log(end);
  }
});

const formDataHTML = document.getElementById("appointment-form");

formDataHTML.addEventListener("submit", (e) => {
  e.preventDefault();
  scheduleAppointment();
});

async function scheduleAppointment() {
  let fd = new FormData(formDataHTML);
  console.log(fd);

  const appointmentType = fd.get("appt-type");
  const zip = fd.get("zip");
  const phone = fd.get("phone");
  const date = fd.get("preferred-time");
  const st = fd.get("start-time");
  const et = fd.get("end-time");

  console.log({
    appointmentType,
    zip,
    phone,
    date,
    st,
    et,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const user_id = user.id;

  if(!user?.id) {
    alert("Failed to get user object");
    return;
  }

  const stDate = formatTime(st);
  const etDate = formatTime(et);

  const { error } = await supabase.from("Appointments").insert({
    user_id: user_id,
    title: appointmentType,
    location: zip,
    start_time: stDate.toISOString(),
    end_time: etDate.toISOString(),
    status: "PENDING",
    phone_number: phone
  });

  if(error) {
    console.error("Error inserting:", error);
    alert("There was a problem creating your appointment. Try again later.");
    return;
  }

  // Redirect on success
  window.location.href = "/appointments";
}

// Reformat a time into a Date
function formatTime(time) {
  if(typeof time !== "string") {
    throw new TypeError("Time must be of type string");
  }

  const [hour, minute] = time.split(":");
  const d = new Date();
  d.setHours(hour, minute);
  return d;
}