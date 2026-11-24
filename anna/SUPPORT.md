# Doorknock (Anna App) — Support

**App:** Doorknock · app id 938 · slug `doorknock`
**What it does:** one-tap pre-meeting briefing — 30-day web sweep, model draft,
deterministic source audit, saved one-page brief.

## Quick fixes

| Symptom | What to do |
|---|---|
| "The sweep returned nothing" | Check the subject spelling; try the company name without suffixes (e.g. `Monzo` not `Monzo Bank Ltd`). Very small or brand-new subjects may have no last-30-day coverage. |
| "Your Anna quota is too low" | The message names the required vs remaining CU. A full run costs one plan call + 4 basic searches + up to two drafts. Top up quota or use BYOK, then press Retry — the sealed sweep is reused, no re-search is charged. |
| "The model could not produce a usable draft" | Press Retry (reuses the sealed sweep). If it persists, try again later — the drafting model may be degraded. |
| Brief shows a "Repaired / Uncertain" section | Working as designed: untraceable claims are flagged, not hidden. Read the cited sources before relying on any claim. |
| Saved brief missing after reinstall | Briefs live in the app's own Anna storage on the installing account. Reinstalling under a different account starts an empty library. |

## Data & privacy in one paragraph

Doorknock uses only Anna's host-managed `web.search` (provider-routed, no keys)
and `llm.complete` (your model, your quota). It holds no third-party
credentials, talks to no external databases, and fetches only at runtime when
you press Knock. Briefs and the interrupted-run checkpoint stay in your own
Anna app storage. See `PRIVACY.md`.

## Contact

- Issues / questions: open an issue at <https://github.com/sneldao/doorknock>
- Anna program questions: the Builder Discord or `forum.anna.partners`
- Grant/billing questions: Anna support via the Developer Console / `dev@anna.partners`
