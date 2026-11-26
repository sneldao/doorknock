# Zapier Build Week post — published

**URL:** https://community.zapier.com/build-week-143/morning-meeting-briefings-google-calendar-source-audited-ai-brief-gmail-54141

**Title:** Morning meeting briefings: Google Calendar → source-audited AI brief → Gmail

**Tags:** Challenge 1, Challenge 2, Google Calendar, Gmail, Zapier MCP

## Published body

**Challenge 1 + Challenge 2**

I automated a recurring job I normally do manually: scan upcoming external meetings, research the company or person, and send myself prep before the meeting.

**Apps:** Google Calendar + Gmail through Zapier MCP. The intelligence layer in the middle was [Doorknock](https://doorknock-2azp.onrender.com), a meeting-prep agent with a deterministic source-audit gate.

**What happened in the proof run:**

1. I created a synthetic external-attendee calendar event for an Anthropic partnership prep session. The attendee used a reserved example.com address, so no private meeting data was involved.
2. Zapier MCP read the upcoming event from Google Calendar.
3. My AI tool called Doorknock directly for the long-running research/briefing step, then parsed the finished SSE result.
4. Doorknock's deterministic auditor rejected the first draft: 1 of 6 developments failed source tracing, with unsupported figure/name findings and 83% grounding.
5. The repair loop redrafted the brief. The delivered digest carried the proof: **REPAIRED — 6 source-traced developments retained; 0 moved to uncertain**, with source links, discussion points, open questions, and audit notes.
6. Zapier MCP sent the finished digest to me through Gmail.

**Win:** Zapier MCP made the authenticated app edges fast: Calendar read + Gmail send. I also scoped Gmail to send-only; a follow-up read attempt correctly failed with “Insufficient Permission,” which was a nice confirmation that the connection was not over-privileged for the workflow.

**Miss / implementation lesson:** long-running agent research should not be squeezed into a normal webhook action. Zapier MCP was excellent for the app edges, while the AI tool made the minutes-long Doorknock call directly. A production version should expose an async `202 Accepted` + job ID + polling API. Also, even a reserved example.com calendar invite can generate a delivery-failure notification, so future demos should use a dedicated test calendar or attendee setup that avoids invite mail entirely.

**Saved as a reusable skill:** `morning-meeting-briefings`. The core prompt is:

> Using Zapier MCP, read my Google Calendar for the next 3 days. Identify events with at least one external attendee. Process at most 2 meetings. For each selected meeting, call Doorknock with the company or person, meeting time, meeting type, and non-sensitive notes. If the deterministic audit rejects all usable content, do not send it as a brief. Otherwise email me one digest with the substantive brief, source links, grounding verdict, uncertain items, and counts of meetings considered, delivered, blocked, and repaired.

Screenshots attached: the delivered Gmail digest top and the trust-gate section, with the operator address redacted.

Doorknock source: https://github.com/sneldao/doorknock
