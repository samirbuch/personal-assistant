/**
 * LLM Manager
 * 
 * Creates and configures the LLM agent (Claude)
 */

import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { VoiceAgent } from "../core/VoiceAgent";
import { OutlookManager, type TimeSlot, type CalendarEvent } from "./OutlookManager";

const systemPromptURL = new URL("../assets/system-prompt.txt", import.meta.url);
const systemPrompt = Bun.file(systemPromptURL)

export async function createLLMAgent(voiceAgent?: VoiceAgent) {
  const tools: Record<string, any> = {};
  
  // Initialize Outlook manager (available to all instances)
  const outlookManager = new OutlookManager();

  // Calendar tools - always available
  tools.getCalendarAvailability = tool({
    description: "Check Samir's calendar availability for a specific date range. Returns available time slots when Samir is free to schedule appointments.",
    inputSchema: z.object({
      startDate: z.string().describe("Start date/time in ISO format (e.g., '2024-10-20T09:00:00Z')"),
      endDate: z.string().describe("End date/time in ISO format (e.g., '2024-10-20T17:00:00Z')"),
      minDurationMinutes: z.number().optional().describe("Minimum duration needed in minutes (default: 30)")
    }),
    execute: async ({ startDate, endDate, minDurationMinutes }) => {
      try {
        console.log(`[LLM Tool] Getting availability from ${startDate} to ${endDate}`);
        const slots = await outlookManager.getAvailableSlots(
          new Date(startDate),
          new Date(endDate),
          minDurationMinutes
        );
        
        // Format slots for LLM
        const formatted = slots.map((slot: TimeSlot) => ({
          start: new Date(slot.start).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          end: new Date(slot.end).toLocaleString('en-US', { timeZone: 'America/New_York' })
        }));
        
        return { 
          success: true, 
          availableSlots: formatted,
          count: formatted.length 
        };
      } catch (error: any) {
        console.error(`[LLM Tool] Error getting availability:`, error);
        return { 
          success: false, 
          error: error.message || "Failed to get calendar availability" 
        };
      }
    }
  });

  // tools.createCalendarEvent = tool({
  //   description: "Create a new event on Samir's Outlook calendar. Use this after confirming an appointment time with a business.",
  //   inputSchema: z.object({
  //     subject: z.string().describe("Event title/subject (e.g., 'Haircut at XYZ Barbershop')"),
  //     startDateTime: z.string().describe("Event start date/time in ISO format"),
  //     endDateTime: z.string().describe("Event end date/time in ISO format"),
  //     location: z.string().optional().describe("Location/address of the event"),
  //     notes: z.string().optional().describe("Additional notes or details about the event")
  //   }),
  //   execute: async ({ subject, startDateTime, endDateTime, location, notes }) => {
  //     try {
  //       console.log(`[LLM Tool] Creating calendar event: ${subject}`);
  //       const event = await outlookManager.createEvent(
  //         subject,
  //         new Date(startDateTime),
  //         new Date(endDateTime),
  //         location,
  //         notes
  //       );
        
  //       return { 
  //         success: true, 
  //         eventId: event.id,
  //         subject: event.subject,
  //         start: event.start.dateTime,
  //         end: event.end.dateTime
  //       };
  //     } catch (error: any) {
  //       console.error(`[LLM Tool] Error creating event:`, error);
  //       return { 
  //         success: false, 
  //         error: error.message || "Failed to create calendar event" 
  //       };
  //     }
  //   }
  // });

  tools.getCalendarEvents = tool({
    description: "Get existing events from Samir's calendar for a specific date range. Useful for checking what's already scheduled.",
    inputSchema: z.object({
      startDate: z.string().describe("Start date/time in ISO format"),
      endDate: z.string().describe("End date/time in ISO format")
    }),
    execute: async ({ startDate, endDate }) => {
      try {
        console.log(`[LLM Tool] Getting events from ${startDate} to ${endDate}`);
        const events = await outlookManager.getEvents(
          new Date(startDate),
          new Date(endDate)
        );
        
        // Format events for LLM
        const formatted = events.map((event: CalendarEvent) => ({
          subject: event.subject,
          start: new Date(event.start.dateTime).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          end: new Date(event.end.dateTime).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          location: event.location?.displayName
        }));
        
        return { 
          success: true, 
          events: formatted,
          count: formatted.length 
        };
      } catch (error: any) {
        console.error(`[LLM Tool] Error getting events:`, error);
        return { 
          success: false, 
          error: error.message || "Failed to get calendar events" 
        };
      }
    }
  });

  // Only add tools if voiceAgent is provided (after initialization)
  if (voiceAgent) {
    tools.sendDTMF = tool({
      description: "Send DTMF (touch-tone) digits over the phone connection. Use this to navigate phone menus (e.g., 'Press 1 for sales'). Digits can be 0-9, *, or #.",
      inputSchema: z.object({
        digits: z.string().describe("The DTMF digits to send (e.g., '1', '123', '*', '#')")
      }),
      execute: async ({ digits }) => {
        console.log(`[LLM Tool] Sending DTMF: ${digits}`);
        voiceAgent.sendDTMF(digits);
        return { success: true, digits };
      }
    });

    tools.hangUpCall = tool({
      description: "End the current phone call. Use this after completing the task, leaving a voicemail, or when asked to hang up.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`[LLM Tool] Hanging up call`);
        await voiceAgent.hangUp();
        return { success: true, message: "Call ended" };
      }
    });
  }

  console.log("System prompt:", await systemPrompt.text())

  return new Agent({
    model: anthropic("claude-3-5-haiku-latest"),
    system: `
    ${await systemPrompt.text()}
    Today's date is ${new Date().toISOString()}
    `,
    tools,
    stopWhen: stepCountIs(20)
  });
}
