/**
 * OutlookManager Parsing Tests
 * 
 * Tests for iCal format parsing, date conversion, and text escaping.
 * These are pure unit tests with no network calls or mocked calendar data.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import { OutlookManager } from "../../src/managers/OutlookManager";

describe("OutlookManager - iCal Parsing", () => {
  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  test("should parse basic iCal event data", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1@test.com
SUMMARY:Team Meeting
DTSTART:20241020T140000Z
DTEND:20241020T150000Z
LOCATION:Conference Room A
DESCRIPTION:Weekly team sync
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe("Team Meeting");
    expect(events[0]?.start.dateTime).toBe("2024-10-20T14:00:00Z");
    expect(events[0]?.end.dateTime).toBe("2024-10-20T15:00:00Z");
    expect(events[0]?.location?.displayName).toBe("Conference Room A");
    expect(events[0]?.body?.content).toBe("Weekly team sync");
  });

  test("should parse multiple events", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@test.com
SUMMARY:Morning Meeting
DTSTART:20241020T090000Z
DTEND:20241020T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-2@test.com
SUMMARY:Lunch Break
DTSTART:20241020T120000Z
DTEND:20241020T130000Z
END:VEVENT
BEGIN:VEVENT
UID:event-3@test.com
SUMMARY:Afternoon Session
DTSTART:20241020T140000Z
DTEND:20241020T160000Z
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events).toHaveLength(3);
    expect(events[0]?.subject).toBe("Morning Meeting");
    expect(events[1]?.subject).toBe("Lunch Break");
    expect(events[2]?.subject).toBe("Afternoon Session");
  });

  test("should handle escaped characters in iCal text", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event@test.com
SUMMARY:Meeting: Review\\, Discuss\\, Decide
DTSTART:20241020T100000Z
DTEND:20241020T110000Z
DESCRIPTION:Topics:\\n- Q3 Results\\n- Budget Planning
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events[0]?.subject).toBe("Meeting: Review, Discuss, Decide");
    expect(events[0]?.body?.content).toContain("\n");
  });

  test("should parse all-day events", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:all-day@test.com
SUMMARY:Company Holiday
DTSTART:20241020
DTEND:20241021
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events).toHaveLength(1);
    expect(events[0]?.subject).toBe("Company Holiday");
    // Date-only format should be parsed to midnight UTC
    expect(events[0]?.start.dateTime).toBe("2024-10-20T00:00:00Z");
  });

  test("should handle line continuations in iCal format", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event@test.com
SUMMARY:Event with Long Description
DTSTART:20241020T100000Z
DTEND:20241020T110000Z
DESCRIPTION:This is a very long description that spans multiple lines
 because it exceeds the 75 character limit per line in iCal format
 and needs to be continued.
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events[0]?.body?.content).toBe(
      "This is a very long description that spans multiple linesbecause it exceeds the 75 character limit per line in iCal formatand needs to be continued."
    );
  });

  test("should extract timezone information", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event@test.com
SUMMARY:Meeting in ET
DTSTART;TZID=America/New_York:20241020T100000Z
DTEND;TZID=America/New_York:20241020T110000Z
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events[0]?.start.timeZone).toBe("America/New_York");
    expect(events[0]?.end.timeZone).toBe("America/New_York");
  });

  test("should parse dates with timezone", () => {
    const icalData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event@test.com
SUMMARY:Meeting in ET
DTSTART;TZID=America/New_York:20241020T100000Z
DTEND;TZID=America/New_York:20241020T110000Z
END:VEVENT
END:VCALENDAR`;

    const events = (outlookManager as any).parseICalData(icalData);

    expect(events[0]?.start.dateTime).toBe("2024-10-20T10:00:00Z");
    expect(events[0]?.start.timeZone).toBe("America/New_York");
  });
});

describe("OutlookManager - Date Parsing", () => {
  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  test("should parse date-only format (YYYYMMDD)", () => {
    const dateStr = "20241020";
    const result = (outlookManager as any).parseICalDate(dateStr);

    expect(result).toBe("2024-10-20T00:00:00Z");
  });

  test("should parse datetime format with Z (YYYYMMDDTHHMMSSZ)", () => {
    const dateStr = "20241020T143000Z";
    const result = (outlookManager as any).parseICalDate(dateStr);

    expect(result).toBe("2024-10-20T14:30:00Z");
  });

  test("should parse datetime format without Z (YYYYMMDDTHHMMSS)", () => {
    const dateStr = "20241020T143000";
    const result = (outlookManager as any).parseICalDate(dateStr);

    expect(result).toBe("2024-10-20T14:30:00Z");
  });

  test("should handle datetime with seconds", () => {
    const dateStr = "20241020T143045Z";
    const result = (outlookManager as any).parseICalDate(dateStr);

    expect(result).toBe("2024-10-20T14:30:45Z");
  });
});

describe("OutlookManager - Text Unescaping", () => {
  let outlookManager: OutlookManager;

  beforeEach(() => {
    outlookManager = new OutlookManager();
  });

  test("should unescape commas", () => {
    const text = "First\\, Second\\, Third";
    const result = (outlookManager as any).unescapeICalText(text);

    expect(result).toBe("First, Second, Third");
  });

  test("should unescape semicolons", () => {
    const text = "Item 1\\; Item 2\\; Item 3";
    const result = (outlookManager as any).unescapeICalText(text);

    expect(result).toBe("Item 1; Item 2; Item 3");
  });

  test("should unescape newlines", () => {
    const text = "Line 1\\nLine 2\\nLine 3";
    const result = (outlookManager as any).unescapeICalText(text);

    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  test("should handle multiple escape sequences", () => {
    const text = "Hello\\, World\\n- Item 1\\; Item 2\\n- Done";
    const result = (outlookManager as any).unescapeICalText(text);

    expect(result).toBe("Hello, World\n- Item 1; Item 2\n- Done");
  });
});
