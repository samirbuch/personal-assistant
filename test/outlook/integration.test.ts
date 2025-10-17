import { describe, test, expect, beforeEach } from "@jest/globals";
import { OutlookManager } from "../../src/managers/OutlookManager";

/**
 * Integration Tests - Real Calendar
 * 
 * These tests require OUTLOOK_CALENDAR_URL to be set in your .env file
 * They make real HTTP requests to fetch calendar data from Outlook
 * 
 * To skip these tests, set SKIP_INTEGRATION_TESTS=true
 * 
 * Run with: bun test test/outlook/integration.test.ts
 */

describe("OutlookManager Integration Tests (Real Calendar)", () => {
  const shouldSkip = !process.env.OUTLOOK_CALENDAR_URL || process.env.SKIP_INTEGRATION_TESTS === "true";

  if (shouldSkip) {
    test.skip("Skipping integration tests - OUTLOOK_CALENDAR_URL not set or SKIP_INTEGRATION_TESTS=true", () => {});
    return;
  }

  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  test("should fetch real calendar data from Outlook", async () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Start of today

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7); // Next 7 days
    endDate.setHours(23, 59, 59, 999);

    const events = await outlookManager.getEvents(startDate, endDate);

    console.log(`\n📅 Found ${events.length} events in the next 7 days:`);
    events.forEach(event => {
      console.log(`  - ${event.subject}`);
      console.log(`    Start: ${new Date(event.start.dateTime).toLocaleString()}`);
      console.log(`    End: ${new Date(event.end.dateTime).toLocaleString()}`);
      if (event.location?.displayName) {
        console.log(`    Location: ${event.location.displayName}`);
      }
    });

    // Basic validation
    expect(Array.isArray(events)).toBe(true);
    events.forEach(event => {
      expect(event).toHaveProperty("id");
      expect(event).toHaveProperty("subject");
      expect(event).toHaveProperty("start");
      expect(event).toHaveProperty("end");
      expect(typeof event.subject).toBe("string");
    });
  }, 10000); // 10 second timeout for network request

  test("should find available time slots in real calendar", async () => {
    const startDate = new Date();
    startDate.setHours(9, 0, 0, 0); // 9 AM today

    const endDate = new Date();
    endDate.setHours(17, 0, 0, 0); // 5 PM today

    const slots = await outlookManager.getAvailableSlots(startDate, endDate, 30);

    console.log(`\n⏰ Found ${slots.length} available time slots today (30+ min):`);
    slots.forEach((slot, index) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      console.log(`  ${index + 1}. ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()} (${Math.round(durationMinutes)} min)`);
    });

    // Basic validation
    expect(Array.isArray(slots)).toBe(true);
    slots.forEach(slot => {
      expect(slot).toHaveProperty("start");
      expect(slot).toHaveProperty("end");
      
      // Verify slot is at least 30 minutes
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      expect(durationMinutes).toBeGreaterThanOrEqual(30);
    });
  }, 10000);

  test("should fetch events for a specific date range", async () => {
    // Test for tomorrow only
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const events = await outlookManager.getEvents(tomorrow, dayAfterTomorrow);

    console.log(`\n📅 Events tomorrow (${tomorrow.toDateString()}):`);
    if (events.length === 0) {
      console.log("  No events scheduled");
    } else {
      events.forEach(event => {
        console.log(`  - ${event.subject} at ${new Date(event.start.dateTime).toLocaleTimeString()}`);
      });
    }

    expect(Array.isArray(events)).toBe(true);
  }, 10000);

  test("should handle wide date range (30 days)", async () => {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const events = await outlookManager.getEvents(startDate, endDate);

    console.log(`\n📅 Total events in next 30 days: ${events.length}`);

    // Group by date
    const eventsByDate = new Map<string, number>();
    events.forEach(event => {
      const date = new Date(event.start.dateTime).toDateString();
      eventsByDate.set(date, (eventsByDate.get(date) || 0) + 1);
    });

    console.log("\n📊 Events per day:");
    Array.from(eventsByDate.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .slice(0, 10) // Show first 10 days with events
      .forEach(([date, count]) => {
        console.log(`  ${date}: ${count} event${count !== 1 ? 's' : ''}`);
      });

    expect(Array.isArray(events)).toBe(true);
  }, 15000); // 15 second timeout for larger request

  test("should create mock event (read-only warning)", async () => {
    const subject = "Test Event - Hair Appointment";
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(14, 0, 0, 0); // Tomorrow at 2 PM

    const endDate = new Date(startDate);
    endDate.setHours(15, 0, 0, 0); // 1 hour duration

    const event = await outlookManager.createEvent(
      subject,
      startDate,
      endDate,
      "Test Location",
      "This is a test event created by the integration test"
    );

    console.log(`\n⚠️  Mock event created (NOT saved to calendar):`);
    console.log(`  Subject: ${event.subject}`);
    console.log(`  Start: ${new Date(event.start.dateTime).toLocaleString()}`);
    console.log(`  End: ${new Date(event.end.dateTime).toLocaleString()}`);
    console.log(`  Location: ${event.location?.displayName}`);
    console.log(`\n  ⚠️  Remember: This is read-only! You must manually add this to your calendar.`);

    expect(event.subject).toBe(subject);
    expect(event.id).toContain("temp-");
    expect(event.location?.displayName).toBe("Test Location");
  });
});
