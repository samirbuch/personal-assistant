/**
 * Outlook Manager
 * 
 * Fetches and parses calendar data from Outlook iCal subscription URL
 * No authentication required - just uses the public calendar URL
 */

export interface CalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  body?: {
    content: string;
  };
}

export interface TimeSlot {
  start: string;
  end: string;
}

export class OutlookManager {
  private calendarUrl: string;

  constructor() {
    // Load calendar subscription URL from environment variable
    this.calendarUrl = process.env.OUTLOOK_CALENDAR_URL || "";

    if (!this.calendarUrl) {
      console.warn("[OutlookManager] Missing OUTLOOK_CALENDAR_URL environment variable.");
      console.warn("  Get this from Outlook > Calendar Settings > Shared Calendars > Publish Calendar");
    }
  }

  /**
   * Fetch and parse iCal data from the calendar URL
   */
  private async fetchCalendarData(): Promise<CalendarEvent[]> {
    if (!this.calendarUrl) {
      throw new Error("OUTLOOK_CALENDAR_URL not configured");
    }

    try {
      console.log("[OutlookManager] Fetching calendar data...");
      const response = await fetch(this.calendarUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
      }

      const icalData = await response.text();
      return this.parseICalData(icalData);
    } catch (error) {
      console.error("[OutlookManager] Error fetching calendar:", error);
      throw error;
    }
  }

  /**
   * Parse iCal format into structured events
   */
  private parseICalData(icalData: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];
    const lines = icalData.split(/\r?\n/);

    let currentEvent: Partial<CalendarEvent> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;

      let line = currentLine.trim();

      // Handle line continuation (lines starting with space or tab)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!nextLine || (!nextLine.startsWith(' ') && !nextLine.startsWith('\t'))) {
          break;
        }
        i++;
        line += nextLine.trim();
      }

      if (line === 'BEGIN:VEVENT') {
        currentEvent = {
          id: '',
          subject: '',
          start: { dateTime: '', timeZone: 'UTC' },
          end: { dateTime: '', timeZone: 'UTC' }
        };
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.id && currentEvent.subject && currentEvent.start && currentEvent.end) {
          events.push(currentEvent as CalendarEvent);
          console.log(`[OutlookManager] Parsed event: "${currentEvent.subject}" from ${currentEvent.start.dateTime} to ${currentEvent.end.dateTime}`);
        } else {
          console.log(`[OutlookManager] Skipping incomplete event (missing ${!currentEvent.id ? 'id' : !currentEvent.subject ? 'subject' : !currentEvent.start ? 'start' : 'end'})`);
        }
        currentEvent = null;
      } else if (currentEvent) {
        // Parse event properties
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);

        if (key === 'UID') {
          currentEvent.id = value;
        } else if (key === 'SUMMARY') {
          currentEvent.subject = this.unescapeICalText(value);
        } else if (key.startsWith('DTSTART')) {
          currentEvent.start = {
            dateTime: this.parseICalDate(value),
            timeZone: this.extractTimeZone(key) || 'UTC'
          };
        } else if (key.startsWith('DTEND')) {
          currentEvent.end = {
            dateTime: this.parseICalDate(value),
            timeZone: this.extractTimeZone(key) || 'UTC'
          };
        } else if (key === 'LOCATION') {
          currentEvent.location = {
            displayName: this.unescapeICalText(value)
          };
        } else if (key === 'DESCRIPTION') {
          currentEvent.body = {
            content: this.unescapeICalText(value)
          };
        } else if (key === 'RRULE') {
          // Store recurrence rule for later expansion
          (currentEvent as any).rrule = value;
        }
      }
    }

    return events;
  }

  /**
   * Expand recurring events based on RRULE
   */
  private expandRecurringEvents(events: CalendarEvent[], startDate: Date, endDate: Date): CalendarEvent[] {
    const expandedEvents: CalendarEvent[] = [];

    for (const event of events) {
      const rrule = (event as any).rrule;
      
      if (!rrule) {
        // Not a recurring event, add as-is
        expandedEvents.push(event);
        continue;
      }

      // Parse the RRULE
      const rules = this.parseRRule(rrule);
      if (!rules.freq) {
        // Invalid or unsupported RRULE, add original event
        expandedEvents.push(event);
        continue;
      }

      // Generate occurrences
      const occurrences = this.generateOccurrences(event, rules, startDate, endDate);
      expandedEvents.push(...occurrences);
    }

    return expandedEvents;
  }

  /**
   * Parse RRULE string into structured format
   */
  private parseRRule(rruleStr: string): any {
    const rules: any = {};
    const parts = rruleStr.split(';');

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (!key || !value) continue;

      switch (key) {
        case 'FREQ':
          rules.freq = value; // DAILY, WEEKLY, MONTHLY, YEARLY
          break;
        case 'INTERVAL':
          rules.interval = parseInt(value, 10);
          break;
        case 'COUNT':
          rules.count = parseInt(value, 10);
          break;
        case 'UNTIL':
          rules.until = new Date(this.parseICalDate(value));
          break;
        case 'BYDAY':
          rules.byDay = value.split(','); // MO,WE,FR
          break;
        case 'BYMONTHDAY':
          rules.byMonthDay = value.split(',').map(d => parseInt(d, 10));
          break;
      }
    }

    return rules;
  }

  /**
   * Generate recurring event occurrences
   */
  private generateOccurrences(
    baseEvent: CalendarEvent,
    rules: any,
    rangeStart: Date,
    rangeEnd: Date
  ): CalendarEvent[] {
    const occurrences: CalendarEvent[] = [];
    const eventStart = new Date(baseEvent.start.dateTime);
    const eventEnd = new Date(baseEvent.end.dateTime);
    const duration = eventEnd.getTime() - eventStart.getTime();

    const maxOccurrences = rules.count || 1000; // Safety limit
    let occurrenceCount = 0;

    // Determine end date for generation (use UNTIL or range end)
    const generationEnd = rules.until 
      ? new Date(Math.min(rules.until.getTime(), rangeEnd.getTime()))
      : rangeEnd;

    if (rules.freq === 'WEEKLY' && rules.byDay) {
      // Special handling for WEEKLY with BYDAY (e.g., MO,WE,FR)
      const interval = rules.interval || 1;
      let weekStartDate = new Date(eventStart);
      
      // Find the start of the week containing eventStart
      const dayOfWeek = weekStartDate.getDay();
      const daysToSunday = dayOfWeek; // Days back to Sunday
      weekStartDate.setDate(weekStartDate.getDate() - daysToSunday);
      weekStartDate.setHours(eventStart.getHours(), eventStart.getMinutes(), eventStart.getSeconds(), 0);

      while (weekStartDate <= generationEnd && occurrenceCount < maxOccurrences) {
        // Check each day in the current week
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
          const currentDate = new Date(weekStartDate);
          currentDate.setDate(currentDate.getDate() + dayOffset);
          
          const dayAbbrev = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][currentDate.getDay()];
          
          if (rules.byDay.includes(dayAbbrev) && 
              currentDate >= eventStart && 
              currentDate >= rangeStart && 
              currentDate <= generationEnd) {
            const occurrenceEnd = new Date(currentDate.getTime() + duration);
            occurrences.push({
              ...baseEvent,
              id: `${baseEvent.id}-${currentDate.toISOString()}`,
              start: {
                dateTime: currentDate.toISOString(),
                timeZone: baseEvent.start.timeZone
              },
              end: {
                dateTime: occurrenceEnd.toISOString(),
                timeZone: baseEvent.end.timeZone
              }
            });
            occurrenceCount++;
            
            if (occurrenceCount >= maxOccurrences) break;
          }
        }
        
        // Move to next week(s) based on interval
        weekStartDate.setDate(weekStartDate.getDate() + (7 * interval));
      }
    } else {
      // Simple recurrence (DAILY, WEEKLY without BYDAY, MONTHLY, YEARLY)
      let currentDate = new Date(eventStart);
      const interval = rules.interval || 1;

      while (currentDate <= generationEnd && occurrenceCount < maxOccurrences) {
        // Check if this occurrence is within our range
        if (currentDate >= rangeStart) {
          const occurrenceEnd = new Date(currentDate.getTime() + duration);
          occurrences.push({
            ...baseEvent,
            id: `${baseEvent.id}-${currentDate.toISOString()}`,
            start: {
              dateTime: currentDate.toISOString(),
              timeZone: baseEvent.start.timeZone
            },
            end: {
              dateTime: occurrenceEnd.toISOString(),
              timeZone: baseEvent.end.timeZone
            }
          });
          occurrenceCount++;
        }

        // Move to next occurrence
        switch (rules.freq) {
          case 'DAILY':
            currentDate.setDate(currentDate.getDate() + interval);
            break;
          case 'WEEKLY':
            currentDate.setDate(currentDate.getDate() + (7 * interval));
            break;
          case 'MONTHLY':
            currentDate.setMonth(currentDate.getMonth() + interval);
            break;
          case 'YEARLY':
            currentDate.setFullYear(currentDate.getFullYear() + interval);
            break;
          default:
            // Unknown frequency, break to avoid infinite loop
            break;
        }

        // Safety check to prevent infinite loops
        if (currentDate > new Date('2030-01-01')) {
          break;
        }
      }
    }

    console.log(`[OutlookManager] Expanded "${baseEvent.subject}" into ${occurrences.length} occurrences`);
    return occurrences;
  }

  /**
   * Unescape iCal text (commas, semicolons, newlines)
   */
  private unescapeICalText(text: string): string {
    return text
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\n/g, '\n')
      .replace(/\\N/g, '\n');
  }

  /**
   * Parse iCal date format to ISO string
   */
  private parseICalDate(dateStr: string): string {
    // iCal dates can be in format: YYYYMMDDTHHMMSSZ or YYYYMMDD
    dateStr = dateStr.trim();
    
    if (dateStr.length === 8) {
      // Date only: YYYYMMDD
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day}T00:00:00Z`;
    } else if (dateStr.includes('T')) {
      // DateTime: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
      const parts = dateStr.split('T');
      const datePart = parts[0];
      const timePart = parts[1];
      
      if (!datePart || !timePart) {
        console.warn(`[OutlookManager] Invalid date format: ${dateStr}`);
        return new Date(0).toISOString(); // Return epoch as fallback
      }
      
      // Validate date part is numeric and proper length
      if (datePart.length !== 8 || !/^\d{8}$/.test(datePart)) {
        console.warn(`[OutlookManager] Invalid date part: ${datePart}`);
        return new Date(0).toISOString(); // Return epoch as fallback
      }
      
      const year = datePart.substring(0, 4);
      const month = datePart.substring(4, 6);
      const day = datePart.substring(6, 8);
      
      const timeClean = timePart.replace('Z', '');
      const hour = timeClean.substring(0, 2) || '00';
      const minute = timeClean.substring(2, 4) || '00';
      const second = timeClean.substring(4, 6) || '00';
      
      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    }
    
    return dateStr;
  }  /**
   * Extract timezone from iCal property (e.g., DTSTART;TZID=America/New_York:...)
   */
  private extractTimeZone(property: string): string | null {
    const tzidMatch = property.match(/TZID=([^:;]+)/);
    return tzidMatch?.[1] || null;
  }

  /**
   * Get calendar events for a specific date range
   */
  async getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    const allEvents = await this.fetchCalendarData();
    
    console.log(`[OutlookManager] Total events fetched from calendar: ${allEvents.length}`);
    
    // Expand recurring events first
    const expandedEvents = this.expandRecurringEvents(allEvents, startDate, endDate);
    console.log(`[OutlookManager] After expanding recurring events: ${expandedEvents.length} total events`);
    
    console.log(`[OutlookManager] Searching for range: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    console.log(`[OutlookManager] Searching for range (ISO): ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get date range of all events for debugging
    const eventDates = expandedEvents
      .map(e => new Date(e.start.dateTime))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (eventDates.length > 0) {
      console.log(`[OutlookManager] Calendar date range: ${eventDates[0]?.toLocaleDateString()} to ${eventDates[eventDates.length - 1]?.toLocaleDateString()}`);
    }
    
    // Filter events within the date range
    const filteredEvents = expandedEvents.filter(event => {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      
      // Skip events with invalid dates
      if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) {
        console.warn(`[OutlookManager] Skipping event with invalid date: "${event.subject}"`);
        return false;
      }
      
      // Event overlaps with our date range if:
      // Event starts before our range ends AND event ends after our range starts
      const overlaps = eventStart < endDate && eventEnd > startDate;
      
      // if (!overlaps) {
      //   console.log(`[OutlookManager]   Excluding "${event.subject}" (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
      // }
      
      return overlaps;
    });

    // Sort by start time
    filteredEvents.sort((a, b) => 
      new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime()
    );

    console.log(`[OutlookManager] Found ${filteredEvents.length} events in range`);
    filteredEvents.forEach(event => {
      console.log(`[OutlookManager]   - "${event.subject}" (${new Date(event.start.dateTime).toISOString()})`);
    });
    
    return filteredEvents;
  }  /**
   * Get available time slots (free time) for a date range
   * NOTE: This only checks availability, doesn't create events
   */
  async getAvailableSlots(
    startDate: Date,
    endDate: Date,
    minDurationMinutes: number = 30
  ): Promise<TimeSlot[]> {
    const events = await this.getEvents(startDate, endDate);
    const availableSlots: TimeSlot[] = [];

    let currentTime = startDate;

    for (const event of events) {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);

      // If there's a gap between current time and this event
      const gapMinutes = (eventStart.getTime() - currentTime.getTime()) / (1000 * 60);
      if (gapMinutes >= minDurationMinutes) {
        availableSlots.push({
          start: currentTime.toISOString(),
          end: eventStart.toISOString()
        });
      }

      // Move current time to the end of this event
      if (eventEnd > currentTime) {
        currentTime = eventEnd;
      }
    }

    // Check if there's time remaining until endDate
    const remainingMinutes = (endDate.getTime() - currentTime.getTime()) / (1000 * 60);
    if (remainingMinutes >= minDurationMinutes) {
      availableSlots.push({
        start: currentTime.toISOString(),
        end: endDate.toISOString()
      });
    }

    console.log(`[OutlookManager] Found ${availableSlots.length} available slots`);
    return availableSlots;
  }

  /**
   * NOTE: Cannot create events with iCal subscription URL (read-only)
   * This method will throw an error if called.
   * To create events, you would need to use the Microsoft Graph API or
   * manually add events to your calendar.
   */
  async createEvent(
    subject: string,
    startDateTime: Date,
    endDateTime: Date,
    location?: string,
    body?: string
  ): Promise<CalendarEvent> {
    console.warn("[OutlookManager] Cannot create events with iCal URL (read-only)");

    // Return a mock event for now
    // In production, you might want to store this in a separate system
    // or send a notification to manually add it
    const mockEvent: CalendarEvent = {
      id: `temp-${Date.now()}`,
      subject,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'UTC'
      },
      ...(location && {
        location: { displayName: location }
      }),
      ...(body && {
        body: { content: body }
      })
    };

    console.log(`[OutlookManager] Mock event created (not saved to calendar): ${subject}`);
    console.log(`  Start: ${startDateTime.toISOString()}`);
    console.log(`  End: ${endDateTime.toISOString()}`);
    console.log(`  Location: ${location || 'N/A'}`);
    console.log(`  >> YOU NEED TO MANUALLY ADD THIS TO YOUR CALENDAR <<`);

    return mockEvent;
  }
}
