# Doorknock — Privacy & Data Handling

Doorknock runs entirely inside the Anna App runtime. It has no server of its
own, no database, no analytics, and no third-party API keys.

## What it sends

| Call | Payload | Goes to |
|---|---|---|
| `web.search` | the subject name, the meeting type, and generated query strings | Anna's host-managed search provider (routed by the Anna host) |
| `llm.complete` | the prompt built from the search snippets | the model configured on your Anna account / your BYOK key |

Nothing else leaves the app. No email address, calendar, contacts, or account
data is read — Doorknock never requests those scopes.

## What it stores

Only in the app's own Anna storage bucket on the account that installed it:

- `briefs/<timestamp>` — the finished brief record (query plan, search hits,
  drafted sections, the audit verdict, cited URLs).
- `briefs/last` — a pointer to the newest brief.
- `doorknock/active-task` — a checkpoint written while a run is in flight so a
  closed window can resume without paying for the sweep twice. Cleared when
  the run completes.

There is no cross-account access, no sharing, and no server-side copy.

## Retention

Briefs stay until you remove the app (or the host clears its storage). There is
no automatic deletion and no expiry. The library screen lists what is stored.

## Third parties

Search results are fetched at run time and cited by URL; Doorknock does not
fetch the pages themselves or send them anywhere else. The drafting model is
whatever your Anna account is configured to use — its own terms apply to the
prompt content.

## Contact

Questions or a data request: open an issue at
<https://github.com/sneldao/doorknock>.
