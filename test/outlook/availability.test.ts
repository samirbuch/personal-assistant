import { describe, test, expect, beforeEach } from "@jest/globals";
import { OutlookManager } from "../../src/managers/OutlookManager";
import type { CalendarEvent } from "../../src/managers/OutlookManager";

/**
 * Availability and Event Filtering Tests
 * 
 * Tests for:
 * - Event filtering by date range
 * - Event sorting by start time
 * - Available time slot detection
 * - Minimum duration requirements
 * - Edge cases (no events, fully booked)
 */

describe("OutlookManager - Event Filtering", () => {
  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  describe("getEvents", () => {
    test("should filter events by date range", async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          subject: "Event 1",
          start: { dateTime: "2024-10-20T09:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T10:00:00Z", timeZone: "UTC" }
        },
        {
          id: "2",
          subject: "Event 2",
          start: { dateTime: "2024-10-20T14:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T15:00:00Z", timeZone: "UTC" }
        },
        {
          id: "3",
          subject: "Event 3",
          start: { dateTime: "2024-10-21T10:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-21T11:00:00Z", timeZone: "UTC" }
        }
      ];

      (outlookManager as any).fetchCalendarData = async () => mockEvents;

      const startDate = new Date("2024-10-20T00:00:00Z");
      const endDate = new Date("2024-10-20T23:59:59Z");

      const events = await outlookManager.getEvents(startDate, endDate);

      expect(events).toHaveLength(2);
      expect(events[0]?.subject).toBe("Event 1");
      expect(events[1]?.subject).toBe("Event 2");
    });

    test("should sort events by start time", async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          subject: "Later Event",
          start: { dateTime: "2024-10-20T15:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T16:00:00Z", timeZone: "UTC" }
        },
        {
          id: "2",
          subject: "Earlier Event",
          start: { dateTime: "2024-10-20T09:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T10:00:00Z", timeZone: "UTC" }
        },
        {
          id: "3",
          subject: "Middle Event",
          start: { dateTime: "2024-10-20T12:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T13:00:00Z", timeZone: "UTC" }
        }
      ];

      (outlookManager as any).fetchCalendarData = async () => mockEvents;

      const startDate = new Date("2024-10-20T00:00:00Z");
      const endDate = new Date("2024-10-20T23:59:59Z");

      const events = await outlookManager.getEvents(startDate, endDate);

      expect(events[0]?.subject).toBe("Earlier Event");
      expect(events[1]?.subject).toBe("Middle Event");
      expect(events[2]?.subject).toBe("Later Event");
    });
  });

  describe("getAvailableSlots", () => {
    test("should find available slots between events", async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          subject: "Morning Meeting",
          start: { dateTime: "2024-10-20T09:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T10:00:00Z", timeZone: "UTC" }
        },
        {
          id: "2",
          subject: "Afternoon Meeting",
          start: { dateTime: "2024-10-20T14:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T15:00:00Z", timeZone: "UTC" }
        }
      ];

      (outlookManager as any).fetchCalendarData = async () => mockEvents;

      const startDate = new Date("2024-10-20T08:00:00Z");
      const endDate = new Date("2024-10-20T17:00:00Z");

      const slots = await outlookManager.getAvailableSlots(startDate, endDate, 30);

      // Should have 3 slots: before first event, between events, after last event
      expect(slots.length).toBeGreaterThanOrEqual(1);
      
      // Check that there's a slot between 10:00 and 14:00
      const middleSlot = slots.find(slot => 
        slot.start === "2024-10-20T10:00:00.000Z" && 
        slot.end === "2024-10-20T14:00:00.000Z"
      );
      expect(middleSlot).toBeDefined();
    });

    test("should respect minimum duration requirement", async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          subject: "Event 1",
          start: { dateTime: "2024-10-20T09:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T10:00:00Z", timeZone: "UTC" }
        },
        {
          id: "2",
          subject: "Event 2",
          start: { dateTime: "2024-10-20T10:15:00Z", timeZone: "UTC" }, // Only 15 min gap
          end: { dateTime: "2024-10-20T11:00:00Z", timeZone: "UTC" }
        }
      ];

      (outlookManager as any).fetchCalendarData = async () => mockEvents;

      const startDate = new Date("2024-10-20T08:00:00Z");
      const endDate = new Date("2024-10-20T12:00:00Z");

      const slots = await outlookManager.getAvailableSlots(startDate, endDate, 30);

      // The 15-minute gap between events should NOT appear (less than 30 min minimum)
      const shortSlot = slots.find(slot => 
        slot.start === "2024-10-20T10:00:00.000Z" && 
        slot.end === "2024-10-20T10:15:00.000Z"
      );
      expect(shortSlot).toBeUndefined();
    });

    test("should handle no events (entire range available)", async () => {
      (outlookManager as any).fetchCalendarData = async () => [];

      const startDate = new Date("2024-10-20T09:00:00Z");
      const endDate = new Date("2024-10-20T17:00:00Z");

      const slots = await outlookManager.getAvailableSlots(startDate, endDate, 30);

      expect(slots).toHaveLength(1);
      expect(slots[0]?.start).toBe(startDate.toISOString());
      expect(slots[0]?.end).toBe(endDate.toISOString());
    });

    test("should handle completely booked day (no available slots)", async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: "1",
          subject: "All Day Event",
          start: { dateTime: "2024-10-20T09:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-10-20T17:00:00Z", timeZone: "UTC" }
        }
      ];

      (outlookManager as any).fetchCalendarData = async () => mockEvents;

      const startDate = new Date("2024-10-20T09:00:00Z");
      const endDate = new Date("2024-10-20T17:00:00Z");

      const slots = await outlookManager.getAvailableSlots(startDate, endDate, 30);

      expect(slots).toHaveLength(0);
    });
  });

  describe("createEvent", () => {
    test("should return mock event with warning", async () => {
      const subject = "Haircut Appointment";
      const startDate = new Date("2024-10-20T14:00:00Z");
      const endDate = new Date("2024-10-20T15:00:00Z");
      const location = "Barbershop XYZ";
      const notes = "Confirmed appointment";

      const event = await outlookManager.createEvent(
        subject,
        startDate,
        endDate,
        location,
        notes
      );

      expect(event.subject).toBe(subject);
      expect(event.start.dateTime).toBe(startDate.toISOString());
      expect(event.end.dateTime).toBe(endDate.toISOString());
      expect(event.location?.displayName).toBe(location);
      expect(event.body?.content).toBe(notes);
      expect(event.id).toContain("temp-");
    });

    test("should handle optional fields", async () => {
      const subject = "Simple Event";
      const startDate = new Date("2024-10-20T14:00:00Z");
      const endDate = new Date("2024-10-20T15:00:00Z");

      const event = await outlookManager.createEvent(
        subject,
        startDate,
        endDate
      );

      expect(event.subject).toBe(subject);
      expect(event.location).toBeUndefined();
      expect(event.body).toBeUndefined();
    });
  });

  describe("error handling", () => {
    test("should throw error if OUTLOOK_CALENDAR_URL is not set", async () => {
      const originalUrl = process.env.OUTLOOK_CALENDAR_URL;
      delete process.env.OUTLOOK_CALENDAR_URL;

      const manager = new OutlookManager();

      const startDate = new Date("2024-10-20T00:00:00Z");
      const endDate = new Date("2024-10-20T23:59:59Z");
      
      await expect(manager.getEvents(startDate, endDate)).rejects.toThrow("OUTLOOK_CALENDAR_URL not configured");

      // Restore
      if (originalUrl) {
        process.env.OUTLOOK_CALENDAR_URL = originalUrl;
      }
    });
  });
});
