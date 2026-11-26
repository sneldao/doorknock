---
name: morning-meeting-briefings
description: Generate trusted Doorknock pre-meeting briefs from upcoming Google Calendar events and deliver them by Gmail using Zapier MCP. Use when the user asks for morning meeting prep, calendar-triggered briefings, the Doorknock Zapier workflow, or unattended meeting intelligence.
---

# Morning meeting briefings

Use Zapier MCP for Google Calendar and Gmail. Use direct HTTP from the agent for Doorknock's API; do not route the long-running briefing generation through a Zapier action.

## Safety rules

- Use synthetic or explicitly approved calendar events for demos.
- Never email anyone other than the operator unless the user explicitly asks.
- Redact attendee names and email addresses in public screenshots.
- Do not include private calendar notes in public artifacts.
- If the deterministic audit rejects all usable content, do not present the item as a finished brief.

## Workflow

1. Use the Zapier MCP server configured for the operator (currently `zapierpj`) and the Google Calendar `event_v2` read action (`execute_zapier_read_action`) for the target calendar and time window. Prefer a unique demo search term such as `DoorknockZapierDemo` when using synthetic events.
2. Select events with an external attendee or an explicit external marker approved by the operator. Exclude personal/internal/no-attendee events and meetings already processed in the current run/state file. Reserved domains such as `example.com` are acceptable for synthetic demo attendees.
3. For at most 2 meetings, call Doorknock directly:

   ```bash
   curl -N -X POST https://doorknock-2azp.onrender.com/api/brief \
     -H 'Content-Type: application/json' \
     -d '{"subject":"<company-or-person>","meetingAt":"<iso-time>","kind":"partnership","notes":"calendar-triggered briefing"}'
   ```

4. Parse the terminal `done` SSE event. If `runId` is present, fetch `GET /api/runs/<runId>` for canonical JSON. If it is absent, use the `done` payload itself; include substantive content rather than relying on a link.
5. Interpret the audit conservatively:
   - `gate.pass=true` is deliverable.
   - `verdictLine` beginning `REPAIRED` means the deterministic auditor removed untraceable material; the resulting retained developments may be delivered, but the digest must say the audit repaired the draft and how many developments were retained/moved to uncertain.
   - If there are zero retained developments or an `error` event, do not deliver as a brief.
6. Compose one Gmail digest using the Gmail `message` write action (`gmail_send_email` / `execute_zapier_write_action`) with:
   - meetings considered, briefs delivered, and briefs blocked/repaired;
   - subject and meeting time;
   - masthead/headline and situation;
   - key developments with source links;
   - discussion points and open questions;
   - grounding verdict line and uncertain items;
   - Doorknock live app/repo links if useful.
7. Save a local run artifact under `artifacts/zapier-build-week/` before sending. Include the raw SSE and the exact digest body.

## Build Week evidence

The public artifact should show the delivered Gmail digest, not merely terminal output. Redact private addresses. The concise story is:

> Google Calendar detected the meeting, Doorknock produced a source-audited brief, and Gmail delivered proof — not just content.
