# Outlook Calendar Integration Setup (Simple iCal Method)

This guide shows you how to connect your Outlook calendar using the public iCal subscription URL. **No Azure setup required!**

## Quick Setup (5 minutes)

### Step 1: Get Your Calendar URL

1. Go to [Outlook.com](https://outlook.com) or your Outlook web app
2. Click the **Settings** gear icon (⚙️) in the top right
3. Click **View all Outlook settings** at the bottom
4. Navigate to **Calendar** > **Shared calendars**
5. Under **"Publish a calendar"**, select the calendar you want to share
6. Choose **"Can view all details"** from the dropdown
7. Click **Publish**
8. Copy the **ICS** link (it looks like: `https://outlook.office365.com/owa/calendar/.../calendar.ics`)

### Step 2: Add to Your .env File

1. Create a `.env` file in your project root (or edit existing one):
   ```bash
   cp .env.example .env
   ```

2. Add your calendar URL:
   ```bash
   OUTLOOK_CALENDAR_URL=https://outlook.office365.com/owa/calendar/YOUR_CALENDAR_ID/calendar.ics
   ```

That's it! 🎉

## What Works

### ✅ Read Operations (Fully Functional)
- **Check availability** - Your agent can see when you're free
- **View events** - See what's on your calendar
- **Find time slots** - Automatically find openings for appointments

### ⚠️ Write Operations (Limited)
- **Create events** - The iCal URL is **read-only**, so the agent can't automatically add events to your calendar
- When the agent "creates" an event, it will log the details and you'll need to manually add it

## Available Tools

Your LLM agent has access to these tools:

### `getCalendarAvailability`
Check your calendar for available time slots.

**Example usage by agent:**
- "Let me check when you're available..."
- Finds free slots between existing appointments

### `getCalendarEvents`
Get existing calendar events for a date range.

**Example usage by agent:**
- "Let me see what you have scheduled..."
- Shows all events in a timeframe

### `createCalendarEvent` 
⚠️ **Note:** This only logs event details - doesn't actually create the event.

The agent will tell you what event needs to be added, but you'll have to add it manually to your calendar.

## Troubleshooting

### "Missing OUTLOOK_CALENDAR_URL" warning
- Make sure you created a `.env` file
- Verify the environment variable is set correctly
- Restart your application after adding the variable

### "Failed to fetch calendar" error
- Check that your calendar is still published (it can expire)
- Verify the URL is complete and correct
- Make sure you have internet connection

### Events not showing up
- Published calendars can take a few minutes to update
- Try refreshing the calendar in Outlook first
- The ICS feed might be cached - wait a few minutes

## Want Full Write Access?

If you need the agent to automatically create calendar events, you have two options:

1. **Use Microsoft Graph API** (complex, requires Azure setup - see the git history for the original implementation)
2. **Use a calendar API service** like CalDAV or a third-party calendar service with full API access

For most use cases, the read-only access is sufficient since the agent can check availability and tell you what appointments were made.
