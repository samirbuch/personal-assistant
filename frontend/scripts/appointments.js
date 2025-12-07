import { supabase } from "./supabase.js";

/**
 * @typedef {Object} Status
 * @property {string} status - Status value from database
 * @property {string} label - Human-readable label
 * @property {string} hoverText - Tooltip text for status badge
 * @property {string} backgroundColor - Badge background color
 * @property {string} textColor - Badge text color
 */
// i love jsdoc <3
// i hate regular js <3

/**
 * Appointment status definitions
 * @type {Status[]}
 */
const statuses = [
  {
    status: "PENDING",
    label: "Pending",
    hoverText: "Call scheduled",
    backgroundColor: "#fff3cd",
    textColor: "#856404"
  },
  {
    status: "IN_PROGRESS",
    label: "In Progress",
    hoverText: "Call is currently in progress",
    backgroundColor: "#d1ecf1",
    textColor: "#0c5460"
  },
  {
    status: "SUCCESS",
    label: "Success",
    hoverText: "Appointment successfully scheduled",
    backgroundColor: "#d4edda",
    textColor: "#155724"
  },
  {
    status: "FAILED:TECH ERROR",
    label: "Failed: Technical Error",
    hoverText: "Call failed due to technical issues (bad connection, system error)",
    backgroundColor: "#f8d7da",
    textColor: "#721c24"
  },
  {
    status: "FAILED:BUSINESS CLOSED",
    label: "Failed: Business Closed",
    hoverText: "Business is closed or not accepting appointments",
    backgroundColor: "#f8d7da",
    textColor: "#721c24"
  },
  {
    status: "FAILED:HUMAN ERROR",
    label: "Failed: Human Error",
    hoverText: "Representative couldn't or wouldn't help",
    backgroundColor: "#f8d7da",
    textColor: "#721c24"
  },
  {
    status: "FAILED:NO AVAILABLE SLOTS",
    label: "Failed: No Slots",
    hoverText: "No available appointment times",
    backgroundColor: "#f8d7da",
    textColor: "#721c24"
  }
];

/**
 * Get status configuration by status value
 * @param {string} statusValue - Status value from database
 * @returns {Status} Status configuration object
 */
function getStatus(statusValue) {
  return statuses.find(s => s.status === statusValue) || {
    status: statusValue || "UNKNOWN",
    label: statusValue || "Unknown",
    hoverText: "Status unknown",
    backgroundColor: "#e2e3e5",
    textColor: "#383d41"
  };
}

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
 * Formats and styles the status badge
 * @param {string} statusValue - Status string from database
 * @returns {HTMLElement} Styled status badge element
 */
function createStatusBadge(statusValue) {
  const config = getStatus(statusValue);
  
  const badge = document.createElement("span");
  badge.className = "status-badge";
  badge.textContent = config.label;
  badge.title = config.hoverText;
  badge.style.backgroundColor = config.backgroundColor;
  badge.style.color = config.textColor;
  
  return badge;
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

  const statusCell = document.createElement("td");
  statusCell.appendChild(createStatusBadge(appointment.status));
  row.appendChild(statusCell);

  return row;
}

/**
 * Fetches appointments from Supabase and populates the table
 */
async function loadAppointments() {
  const appointmentsBody = document.getElementById("appointments-body");

  // Show loading state
  appointmentsBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading appointments...</td></tr>';

  try {
    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      appointmentsBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Please log in to view appointments.</td></tr>';
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
      appointmentsBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Error loading appointments. Please try again.</td></tr>';
      return;
    }

    // Clear loading message
    appointmentsBody.innerHTML = "";

    // If no appointments found
    if (!appointments || appointments.length === 0) {
      appointmentsBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No appointments scheduled.</td></tr>';
      return;
    }

    // Create and append a row for each appointment
    appointments.forEach((appointment) => {
      const row = createAppointmentRow(appointment);
      appointmentsBody.appendChild(row);
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    appointmentsBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">An unexpected error occurred.</td></tr>';
  }
}

loadAppointments();

