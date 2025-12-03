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
import { getProfile } from "../utils/misc";

const systemPromptURL = new URL("../assets/system-prompt.txt", import.meta.url);
const systemPrompt = Bun.file(systemPromptURL);

export interface UserContext {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export async function createLLMAgent(voiceAgent?: VoiceAgent, userContext?: UserContext) {
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
    description: "Get existing events from the user's calendar for a specific date range. Useful for checking what's already scheduled.",
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
    tools.transferToHuman = tool({
      description: "Transfer the call to connect the caller directly with a real human (the owner). Use this when the caller requests to speak with a human, or when the situation is too complex for the AI to handle. The AI will gracefully hand off the conversation and disconnect, allowing the caller and owner to continue speaking.",
      inputSchema: z.object({
        reason: z.string().describe("Brief reason why the caller is being transferred to a human")
      }),
      execute: async ({ reason }) => {
        console.log(`[LLM Tool] Transferring to human: ${reason}`);
        try {
          await voiceAgent.transferToHuman(reason);
          return {
            success: true,
            message: "Successfully initiated transfer. You will announce the handoff and then disconnect."
          };
        } catch (error: any) {
          console.error(`[LLM Tool] Error transferring to human:`, error);
          return {
            success: false,
            error: error.message || "Failed to transfer to human"
          };
        }
      }
    });

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

  let promptText = await systemPrompt.text();
  console.log("System prompt:", promptText);

  // TODO: When we're getting data from the database, take another look at this.
  // promptText = promptText
  //   .replace(/{{USER_NAME}}/g, userContext.first_name)
  //   .replace(/{{USER_PHONE}}/g, userContext.phone)
  //   .replace(/{{USER_EMAIL}}/g, userContext.email);

  return new Agent({
    model: anthropic("claude-3-5-haiku-latest"),
    system: `
    ${promptText}
    Today's date is ${new Date().toISOString()}
    `,
    tools,
    stopWhen: stepCountIs(20)
  });
}
