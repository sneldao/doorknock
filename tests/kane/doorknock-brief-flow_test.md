---
mode: testing
max_steps: 50
timeout: 600
target: chrome
chrome_profile: .kane/chrome-profile
headless: true
---

# Session: doorknock-brief-flow

## Step 1
Go to https://doorknock-2azp.onrender.com. Fill in the meeting request form: subject 'Anthropic', meeting type 'partnership', meeting time tomorrow afternoon, notes 'intro call'. Click the Knock button. Wait for the agent crew to finish — this takes several minutes while search queries, clustering, drafting and audit stages stream by. Then verify the finished brief renders completely: masthead, headline, 'Key developments' with source links on every development, 'Discussion points', 'Open questions', 'Sources' section, and the auditor/gateway verdict stamp. Report pass only if the brief fully renders; otherwise fail naming what is missing.
