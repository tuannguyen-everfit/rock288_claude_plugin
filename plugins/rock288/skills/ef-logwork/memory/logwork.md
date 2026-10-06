# logwork config

- shared_card: UP-80126            # General Task - Sprint 18-26 - Squad Platform&Capability and Integration
- shared_epic_squad: Platform       # case-insensitive substring of the shared epic summary (step 2 filter)
- repo_roots: ~/Source              # comma-separated; direct children with .git are scanned
- card_projects: UP,CHAL            # only these Jira project keys count as cards in commits/PR titles
- daily_min_hours: 7                # PC 2026-10-06; guideline std 8h, target ≥80%
- max_card_hours_per_day: 8
- day_start: "09:00"
- report_timezone: Asia/Saigon      # +07:00 — every date in this skill is a VN calendar day
- jira_timezone: America/Los_Angeles # account tz; JQL worklogDate runs here, `started` comes back in it

# shared_card is re-detected every run (newest "General Task - Sprint … <shared_epic_squad>" epic)
# and rewritten here when you accept the new sprint's card.
