import { supabase } from "./supabase.js";

/**
 * Formats a date string to a readable format (e.g., "December 7, 2024")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Formats a time string to 12-hour format with AM/PM
 * @param {string} timeString - ISO time string
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
function formatTime(timeString) {
  const date = new Date(timeString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Creates a table row element for an appointment
 * @param {Object} appointment - Appointment data from database
 * @returns {HTMLTableRowElement} Table row element
 */
function createAppointmentRow(appointment) {
  const row = document.createElement("tr");

  // Create and append table cells for each piece of data
  const titleCell = document.createElement("td");
  titleCell.textContent = appointment.title;
  row.appendChild(titleCell);

  const dateCell = document.createElement("td");
  dateCell.textContent = formatDate(appointment.start_time);
  row.appendChild(dateCell);

  const locationCell = document.createElement("td");
  locationCell.textContent = appointment.location;
  row.appendChild(locationCell);

  const timeCell = document.createElement("td");
  timeCell.textContent = formatTime(appointment.start_time);
  row.appendChild(timeCell);

  const phoneCell = document.createElement("td");
  phoneCell.textContent = appointment.phone_number;
  row.appendChild(phoneCell);

  return row;
}

/**
 * Fetches appointments from Supabase and populates the table
 */
async function loadAppointments() {
  const appointmentsBody = document.getElementById("appointments-body");

  // Show loading state
  appointmentsBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading appointments...</td></tr>';

  try {
    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      appointmentsBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Please log in to view appointments.</td></tr>';
      return;
    }

    // Fetch appointments for the current user, ordered by start time
    const { data: appointments, error } = await supabase
      .from("Appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      appointmentsBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Error loading appointments. Please try again.</td></tr>';
      return;
    }

    // Clear loading message
    appointmentsBody.innerHTML = "";

    // If no appointments found
    if (!appointments || appointments.length === 0) {
      appointmentsBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No appointments scheduled.</td></tr>';
      return;
    }

    // Create and append a row for each appointment
    appointments.forEach((appointment) => {
      const row = createAppointmentRow(appointment);
      appointmentsBody.appendChild(row);
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    appointmentsBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">An unexpected error occurred.</td></tr>';
  }
}

loadAppointments();

