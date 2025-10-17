/**
 * OutlookManager Recurring Events Tests
 * 
 * Tests for RRULE parsing and recurring event expansion.
 * Covers DAILY, WEEKLY, MONTHLY frequencies with BYDAY, UNTIL, COUNT, and INTERVAL.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import { OutlookManager } from "../../src/managers/OutlookManager";

describe("OutlookManager - Recurring Events", () => {
  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  test("should parse RRULE from iCal data", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-event-1@test.com
SUMMARY:Weekly Team Meeting
DTSTART:20250825T140000Z
DTEND:20250825T150000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20251231T235959Z
LOCATION:Conference Room
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe("Weekly Team Meeting");
    expect((events[0] as any).rrule).toBe("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20251231T235959Z");
  });

  test("should expand WEEKLY recurring event with BYDAY", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-weekly@test.com
SUMMARY:Software Design Class
DTSTART:20251020T110000Z
DTEND:20251020T122000Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
LOCATION:Tuttleman 302
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    // Get events for a 2-week range
    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-11-03T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should have occurrences for all Mondays and Wednesdays in range
    // Oct 20 (Mon), Oct 22 (Wed), Oct 27 (Mon), Oct 29 (Wed), Nov 3 (Mon) = 5 occurrences
    expect(events.length).toBeGreaterThanOrEqual(5);

    // Check that all events are on Monday or Wednesday
    events.forEach(event => {
      const dayOfWeek = new Date(event.start.dateTime).getDay();
      expect([1, 3]).toContain(dayOfWeek); // 1=Monday, 3=Wednesday
    });

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should expand DAILY recurring event", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-daily@test.com
SUMMARY:Daily Standup
DTSTART:20251020T090000Z
DTEND:20251020T091500Z
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-10-30T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should have exactly 5 occurrences due to COUNT=5
    expect(events.length).toBe(5);

    // Each event should be 1 day apart
    for (let i = 0; i < events.length - 1; i++) {
      const current = new Date(events[i]!.start.dateTime);
      const next = new Date(events[i + 1]!.start.dateTime);
      const diffDays = (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    }

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should respect UNTIL constraint in recurring events", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-until@test.com
SUMMARY:Morning Workout
DTSTART:20251020T060000Z
DTEND:20251020T070000Z
RRULE:FREQ=DAILY;UNTIL=20251025T235959Z
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-10-30T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should only have events until Oct 25 (6 days: 20-25)
    expect(events.length).toBe(6);

    // Last event should be on Oct 25
    const lastEvent = events[events.length - 1];
    expect(lastEvent).toBeDefined();
    const lastDate = new Date(lastEvent!.start.dateTime);
    expect(lastDate.getDate()).toBe(25);
    expect(lastDate.getMonth()).toBe(9); // October = 9

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should respect COUNT constraint in recurring events", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-count@test.com
SUMMARY:Training Session
DTSTART:20251020T140000Z
DTEND:20251020T160000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-12-31T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should have exactly 3 occurrences
    expect(events.length).toBe(3);

    // Each should be 1 week apart
    for (let i = 0; i < events.length - 1; i++) {
      const current = new Date(events[i]!.start.dateTime);
      const next = new Date(events[i + 1]!.start.dateTime);
      const diffDays = (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(7);
    }

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should pass through non-recurring events unchanged", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:one-time-event@test.com
SUMMARY:Doctor Appointment
DTSTART:20251022T100000Z
DTEND:20251022T110000Z
LOCATION:Medical Center
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-10-30T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should have exactly 1 occurrence (not recurring)
    expect(events.length).toBe(1);
    expect(events[0]?.subject).toBe("Doctor Appointment");
    expect(events[0]?.id).toBe("one-time-event@test.com");

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should handle INTERVAL in recurring events", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-interval@test.com
SUMMARY:Bi-weekly Review
DTSTART:20251020T140000Z
DTEND:20251020T150000Z
RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-12-31T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should have 3 occurrences, each 2 weeks apart
    expect(events.length).toBe(3);

    // Check intervals
    for (let i = 0; i < events.length - 1; i++) {
      const current = new Date(events[i]!.start.dateTime);
      const next = new Date(events[i + 1]!.start.dateTime);
      const diffDays = (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(14); // 2 weeks = 14 days
    }

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });

  test("should only expand recurring events within search range", async () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-partial@test.com
SUMMARY:Yoga Class
DTSTART:20251015T070000Z
DTEND:20251015T080000Z
RRULE:FREQ=DAILY;COUNT=20
END:VEVENT
END:VCALENDAR`;

    // Mock the fetchCalendarData method
    const originalFetch = (outlookManager as any).fetchCalendarData.bind(outlookManager);
    (outlookManager as any).fetchCalendarData = async () => {
      return (outlookManager as any).parseICalData(icalData);
    };

    // Search for only 5 days in the middle of the recurrence
    const startDate = new Date('2025-10-20T00:00:00Z');
    const endDate = new Date('2025-10-25T23:59:59Z');
    const events = await outlookManager.getEvents(startDate, endDate);

    // Should only have events within the search range (6 days: 20-25)
    expect(events.length).toBe(6);

    // All events should be within range
    events.forEach(event => {
      const eventDate = new Date(event.start.dateTime);
      expect(eventDate >= startDate).toBe(true);
      expect(eventDate <= endDate).toBe(true);
    });

    // Restore original method
    (outlookManager as any).fetchCalendarData = originalFetch;
  });
});
