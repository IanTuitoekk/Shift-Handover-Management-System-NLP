# Design direction: Strip board

## Concept

**Strip board** borrows the one object every air traffic and ramp control room already
trusts: the *flight progress strip*. A strip is a long, narrow record with a coloured status
tab on its left edge, a time cell, and a few ruled cells of facts. Controllers sort strips
into bays (pending, active, done) on a board, and a glance at the tabs tells them where
attention is needed.

That is exactly the job of this product. A handover, a task, a report and an alert are all
*records that move between states during a shift*. Rendering them as strips gives the UI a
single, recognisable unit, makes scanning fast (status tab, time and category always sit in
the same column), and gives the supervisor's triage board a natural shape (strip bays).

It is deliberately quiet. Dark graphite surfaces, one calm blue for interaction, Kenya
Airways red only when something is overdue or the model is unsure. No hero sections, no
gradients, no imagery.

### Signature elements (what makes it recognisable)

1. **The strip.** Every list item (report, task, alert, briefing item) is a strip: a 4px
   status tab on the left edge carrying colour *and* an icon in the first cell, a mono time
   cell, then ruled cells. Strips sit edge to edge on an inset well separated by 1px rules,
   not floating cards. Radius 4px.
2. **The shift rail.** A 24-hour horizontal rail at the top of each home screen: day shift
   (06:00 to 18:00) and night shift drawn as two segments, a "now" marker, and event ticks
   (ground crew: what I submitted and resolved; supervisor: reports per hour). It answers
   "where am I in the shift?" before anything else.
3. **Mono data voice.** IBM Plex Sans speaks; IBM Plex Mono reports. Every time, count,
   registration, percentage and identifier is set in Plex Mono with tabular figures, so
   columns align and data never looks like prose.
4. **Segmented confidence meter.** Model confidence is a 5-segment meter plus the mono
   percentage. Segments fill in calm blue; below 60% the filled segments turn KQ red, a
   warning icon appears, and the label says "Check". Never colour alone.
5. **Two densities, one language.** Ground crew views run at 44px control height and larger
   type for gloved, standing, tablet use. Supervisor views run at 36px for desk density.
   The same tokens, switched by one class on the app shell.

## Design tokens

All tokens live in `src/styles/theme.css` as CSS custom properties. **Dark is the default**
(`:root`), light is `[data-theme="light"]`. The theme is chosen by the user in the header and
stored in `localStorage` (`kq-theme`); a small inline script in `index.html` applies it before
first paint to avoid a flash.

### Colour (contrast measured, WCAG AA)

| Role | Token | Dark | Light | Notes |
|---|---|---|---|---|
| Page | `--surface-base` | #0d1218 | #eef1f5 | |
| Raised (panels, header) | `--surface-raised` | #141b24 | #fbfcfd | |
| Overlay (dialogs, menus, hover) | `--surface-overlay` | #1b2430 | #fdfefe | |
| Inset (wells, inputs, strip bays) | `--surface-inset` | #0a0e13 | #e7ebf0 | |
| Divider | `--line` | #232d3a | #d6dde5 | decorative only |
| Control border | `--line-control` | #5d6b7c | #7c8898 | 3.18 / 3.51 : 1 on raised (≥3:1) |
| Text | `--text` | #e4e9ef | #141c26 | 14.2 / 16.7 : 1 |
| Secondary text | `--text-muted` | #9ba8b7 | #4b5868 | 7.2 / 7.1 : 1 |
| Tertiary text, placeholders | `--text-faint` | #8592a2 | #5b6777 | 5.5 / 5.6 : 1 |
| Accent (interaction) | `--accent` | #5f9fe8 | #1f5fae | calm blue |
| Accent text/links | `--accent-text` | #8cbcf2 | #1b5499 | 8.7 / 7.4 : 1 |
| Critical (KQ red) | `--critical` | #ed1c24 | #ed1c24 | tabs, meter, icons only |
| Critical text | `--critical-text` | #ff7b80 | #b0131a | 6.9 / 6.9 : 1 |
| Resolved | `--ok`, `--ok-text` | #4fb985, #6fd0a0 | #1f7a4d, #1b6c44 | |
| Chart data | `--data` / `--data-muted` | #5b95da / #455262 | #3d74b8 / #a9b3bf | validated with the dataviz script |

**Red rule.** `--critical` appears only for: tasks past the overdue threshold, and
classifications below 60% confidence (plus blocking errors). It is never a decoration, never a
brand stripe, never a hover colour. Category badges are neutral with icons.

### Type

IBM Plex Sans (400/500/600) and IBM Plex Mono (400/500), self-hosted.
Scale on a 1.2 ratio from 16px: `--text-xs` 12, `--text-sm` 13.5, `--text-md` 15,
`--text-base` 16, `--text-lg` 19, `--text-xl` 23, `--text-2xl` 28.
Ground crew bumps body to 16 and controls to 16; supervisor body is 15.
Headings are sentence case, weight 600, `text-wrap: balance`.

### Space, radius, elevation, motion

- Space: 4px grid, `--space-1` 4 … `--space-9` 56.
- Radius rule: strips and badges 4px (`--radius-strip`), controls 6px (`--radius-control`),
  raised panels and dialogs 10px (`--radius-panel`), counts are pills. Followed everywhere.
- Elevation: dark mode separates by surface step, not shadow. Light mode adds `--elev-1`
  (1px line + faint tinted shadow) to raised surfaces and `--elev-2` to dialogs.
- Motion: `--dur-1` 120ms (hover, press), `--dur-2` 200ms (panel/route change),
  `--dur-3` 320ms (strip leaving a bay on resolve or assign); `--ease-out`
  cubic-bezier(0.2, 0.7, 0.2, 1). Only `transform` and `opacity` animate. Everything is
  disabled under `prefers-reduced-motion: reduce`.
- Density: `--control-h` 44px (ground crew) / 36px (supervisor), set on `.shell--ground` and
  `.shell--supervisor`.

## Imagery (added after review)

The first build used no images, per the original brief. After reviewing it, the product owner
asked for photography to make the screens less plain while keeping the structure. Rules:

- **Where:** the login panel, a banner behind the home heading for each role, and one photo per
  incident category on the report page. Never behind lists, strips, forms or numbers.
- **What:** real maintenance and apron photography from Wikimedia Commons under free licences,
  credited on `/credits` (linked from login and the app footer). Photos with legible airline
  liveries, airport names or company logos were rejected or cropped out. No Kenya Airways logo
  or livery anywhere.
- **Treatment:** photos sit under a theme-aware scrim (`--photo-scrim`, `--photo-panel-scrim`)
  and a calming filter (`--photo-filter`) so overlaid text keeps AA contrast. They are
  decorative (`alt=""`), sized with width and height to avoid layout shift, eagerly loaded only
  above the fold, and hidden on narrow screens where they would crowd content.
- **Empty states** use a tinted icon tile today and accept an `art` image when illustrations exist.



**Ground crew (Jane, maintenance technician).** Often on a tablet on the apron or in the
hangar, mid-task, sometimes at 03:00. *"Hand over fast, and know what's mine."* Needs: write a
handover in under a minute, see what is assigned to them, read what the previous shift left,
resolve tasks. Does not need team statistics, and should never see supervisor controls.

**Supervisor (shift lead).** At a desk with a large screen. *"See the whole operation, find
what needs attention, delegate."* Needs: what is overdue, unassigned or low-confidence; who is
overloaded; patterns across shifts; fast assignment. Submits handovers occasionally.

## Information architecture

| Ground crew | Route | Supervisor | Route |
|---|---|---|---|
| Home: composer + start-of-shift briefing + personal shift rail | `/` | Overview: attention tiles, review queue, insights, workload, shift rail | `/` |
| My tasks: mine first, then other open tasks; my shift timeline | `/my-tasks` | Triage: Unassigned / Assigned / Overdue bays, Resolved tab, sort, assignee filter | `/triage` |
| Reports: grouped by shift | `/reports` | Reports: filters for category, confidence range, date | `/reports` |
| Alerts: all notifications with read state | `/alerts` | Team: workload per person, resolved this shift | `/team` |
| Report detail (shared, resolve + mark read) | `/reports/:id` | Report detail (shared, assign + review) | `/reports/:id` |

Navigation is a single row in the header beside the brand: four items per role, icon + label,
current page underlined in accent. A role badge ("Ground crew" / "Supervisor") sits beside the
user's name. Routes that belong to the other role render a friendly "Not available for your
role" page with a link home. This is UX only; the backend enforces RBAC. Ground crew never
call `GET /api/users`.

Supervisors submit handovers through a secondary "New handover" button in the header that
opens the composer in a dialog.

## Component inventory

| Component | Shared / role | Notes |
|---|---|---|
| `AppShell` (header, nav, role badge, bell, theme switch, user) | shared, role-configured | nav items from `roles.js` |
| `RoleRoute`, `NotAvailablePage` | shared | role guard |
| `Strip` | shared | the signature unit |
| `ConfidenceMeter` | shared | 5 segments, red below 60% |
| `CategoryBadge`, `StatusBadge` | shared | icon + label, neutral |
| `ShiftRail` | shared, role-fed | ground: my events; supervisor: reports per hour |
| `Skeleton`, `EmptyState`, `ErrorState`, `PageHeader`, `Section` | shared | |
| `Composer` | shared | hero layout on ground home, dialog for supervisor |
| `CompletenessHints` | shared (inside composer) | client-side keyword hints, labelled as hints |
| `SubmitResult` | shared | category, confidence, entities, summary, link |
| `TaskStrip` + `ResolveButton` | shared | two-step resolve |
| `NotificationsDrawer` | shared | |
| `ReportDetailPage` | shared, role actions | ground: resolve, mark read; supervisor: assign |
| `Briefing` | ground crew | assigned to me, overdue, previous shift to read |
| `MyTasksPage`, `MyShiftTimeline`, `AlertsPage` | ground crew | |
| `OverviewTiles` | supervisor | each links to a filtered view |
| `TriageBoard`, `AssignControl` (with least-loaded suggestion) | supervisor | select + Assign button |
| `ReviewQueue` | supervisor | low confidence first |
| `InsightPanel` (`BarList`, `ShiftTrend`, recurring entities) | supervisor | inline SVG/CSS, client-side |
| `ReportFilters` | supervisor | category, confidence range, date; URL params |
| `TeamPage`, `WorkloadBars` | supervisor | |

## Where the data comes from

Everything is built on existing endpoints; anything the API does not provide is computed
client-side and labelled where that matters. See "Backend gaps" in the final report.

- Shift windows: client clock with day 06:00 to 18:00 (`config.js`).
- "Mine": `task.assigned_to === me` and `task.resolved_by === me`.
- "Handovers I submitted": `GET /api/handovers?submitted_by=me`.
- Previous-shift handovers to read: notifications whose `sent_at` falls in the previous shift
  window, unread first, with per-item and bulk "Mark as read".
- Recurring aircraft and components: entities exist only on `GET /api/handovers/:id`, so the
  insight panel fetches detail for the latest 30 reports and counts `AIRCRAFT` and
  `COMPONENT` entity texts.

## Skill guidance applied and overridden

**design-taste-frontend**
- Applied: design read and dials (*operational control-room UI for aviation crews, trust-first;
  VARIANCE 3, MOTION 2, DENSITY 7 supervisor / 5 ground crew*); anti-default discipline (no
  purple, no gradient hero, no three equal cards); cards only where elevation means something;
  one accent locked across the app; one documented radius rule; full loading/empty/error
  cycles; label above input; no em dashes in UI copy; Phosphor icons only; copy self-audit.
- Overridden: the skill declares dashboards out of scope (section 13), so its landing-page
  rules (hero, bento, images, marquees) are not used. It defaults to Tailwind and the Motion
  library; this project uses plain CSS custom properties (project rule: all tokens in one
  theme file) and CSS transitions (no heavy libraries). It mandates real photography; the
  project bans stock imagery and logos, so there is none. Its eyebrow rule is satisfied by
  having no eyebrows at all.

**superdesign**
- Applied: repo init (`.superdesign/init/`), `design-system.md`, a project on the
  Superdesign canvas, a pixel-faithful reproduction of the current dashboard as ground truth,
  then two branch variations (ground crew home and supervisor overview) in this direction,
  used as visual references for the build.
- Overridden: the skill says to implement only after the user approves the canvas drafts;
  the brief says to continue without waiting, so the drafts were used as reference and the
  build proceeded. Its logo invariant does not apply: the project has no logo and the brief
  forbids creating one, so identity stays text-only (which the skill's no-logo fallback allows).
  Its component templates expect Tailwind and Lucide; that applies to canvas drafts only.
- Exception: the skill says to pass `design-system.md` on every generation. For the Step 3a
  reproduction I passed the *current* token summary instead, because a faithful copy of the
  old UI cannot be rendered against the new system. Both branch variations did get it.
- Record: project "Kenya Airways shift handover: Strip board", model `gemini-3.1-pro` (free
  tier), three generations: reproduction `aa354f22…`, ground crew home `116f81fc…`, supervisor
  overview `d76cb4b8…`. State is in `.superdesign/resume.json`. The reproduction stopped after
  one report row; it served as a baseline only. From the drafts I kept the strip rows, the
  one-row tile strip, the shift rail and the briefing grouping, and fixed their uppercase
  "OVERDUE" badges, a clipped "Suggested" tag and a rail without hour labels.
- Second round (`execute-flow-pages` from the supervisor draft): report detail `2cf42663…` and a
  dense triage board `0b2d318f…`. Adopted: one least-loaded suggestion per triage bay instead
  of on every strip, "Reassign" when a task already has an owner, single-line titles in compact
  strips, inline toolbar labels, ruled rows for extracted details, and a stacked assign control
  with a full-width resolve button on the detail page. Not adopted: the draft's invented task
  text and counts (the build renders real data only).

**dataviz**
- Applied: form before colour (bar lists for category mix and workload, columns for shift
  trend, a meter for confidence); one data hue plus a de-emphasis grey, validated with its
  script in both modes; 4px rounded data ends, 2px gaps, thin marks, values as text tokens,
  selective labels, single series without a legend box.
- Adapted: its validator is for categorical palettes; our grey is intentionally achromatic,
  so the chroma check does not apply. The grey's sub-3:1 contrast warning is relieved by a
  visible value label on every bar.

**Conflicts with project rules (project rules win)**
- Sentence case everywhere (web-design-guidelines asked for Title Case; replaced last round).
- Dark mode default rather than following the OS.
- No imagery, no logo, no decorative gradients.
- 44px touch targets on ground crew views even though the taste skill's dense presets are smaller.

## Backend gaps

Everything above runs on the existing endpoints. These are the places where the client is
working around missing data, with the endpoint or field that would remove the workaround.

1. ~~**Who submitted a report.**~~ **Done (12 Oct).** Reports now include
   `submitted_by: { user_id, full_name, role }` and the list accepts `?submitted_by=me` or a user
   id. The UI shows "By …" on report strips and the report page, supervisors can filter Reports by
   submitter, Team shows handovers per person this shift, and the ground crew timeline comes from
   the server instead of this browser's storage.
2. **The original narrative.** The detail endpoint returns only `submission_id`, so nobody can
   check a low-confidence summary against what was written. Add to `GET /api/handovers/:id`:
   `"submission": { "content": "...", "language_variant": "mixed", "shift": "Night", "input_type": "text", "submitted_at": "iso" }`.
3. **Server-side report filters.** Filters run client-side over at most 500 reports. Support
   `GET /api/handovers?category_id=&min_confidence=&max_confidence=&from=&to=&limit=&offset=`
   returning the same `{ reports, total, limit, offset }` shape, with `total` reflecting the filter.
4. **Entities for insights.** Recurring aircraft and components need one detail request per
   report (latest 30). Add `GET /api/insights/entities?types=AIRCRAFT,COMPONENT&since=iso` returning
   `[{ "entity_type": "AIRCRAFT", "entity_text": "B737", "report_count": 13 }]`.
5. **Shift statistics.** Tiles and the rail are counted client-side. Add
   `GET /api/stats/shift?start=iso&end=iso` returning
   `{ "reports": 2, "low_confidence": 0, "open_tasks": 4, "overdue_tasks": 3, "unassigned_tasks": 2, "reports_per_hour": [0, 1, ...] }`.
6. **Task context.** Category and summary are parsed out of `task.description`
   ("New <category> incident reported: <summary>"). Include the report fields on each task in
   `GET /api/tasks`: `"report": { "category_name": "...", "summary": "...", "category_confidence": "0.93" }`.
7. **Due times.** "Overdue" is a flat 12-hour client rule (`config.js`), so week-old test tasks
   are permanently red. Add `due_at` (and optionally `priority`) to `task_register` and return it.
8. **Workload.** Computed from all tasks plus `GET /api/users`. Add `GET /api/users/workload`
   returning `[{ "user_id", "full_name", "role", "open": 2, "overdue": 1, "resolved_since": 3 }]`.
9. **Bulk mark-as-read.** "Mark all as read" sends one request per alert. Add
   `PATCH /api/notifications/read` with `{ "notif_ids": ["uuid", ...] }` (or `{ "before": "iso" }`).
10. **Unassign.** `PATCH /api/tasks/:id/assign` requires `assigned_to`, so a supervisor cannot
    return a task to the unassigned pool. Accept `{ "assigned_to": null }`.
11. **Shift definitions.** Day 06:00 to 18:00 is hard-coded client-side. Add
    `GET /api/config/shifts` returning `[{ "name": "Day", "start": "06:00", "end": "18:00" }, { "name": "Night", "start": "18:00", "end": "06:00" }]`.

## Real-time updates

Implemented with Socket.IO on the same port as the REST API.

| Event | Emitted from (backend) | Sent to | Frontend reaction |
|---|---|---|---|
| `handover:created` `{ report, task, notification, submittedBy }` | `controllers/handoverController.js`, after the response | everyone signed in | add the alert and task, refresh report lists, notice "New handover: <category>" (not shown to the submitter) |
| `task:assigned` `{ task, by, previousAssignee }` | `controllers/taskController.js`, `assign` | everyone signed in | update the task in place; the assignee gets "A task was assigned to you", the previous assignee "…reassigned to someone else" |
| `task:resolved` `{ task, by }` | `controllers/taskController.js`, `resolve` | everyone signed in | task leaves open lists; the assignee is told if a colleague resolved it |

- Backend: `backend/realtime.js` authenticates the handshake with the same checks as the REST API
  (JWT signature and expiry, revoked tokens), joins server-chosen rooms (`authenticated`,
  `user:<id>`, `role:<role>`) and disconnects when the token expires. Task events go to everyone
  because every signed-in user can already list all tasks.
- Frontend: `hooks/useRealtime.js` connects from `AppShell`, applies events to the shared task and
  alert state, skips echoes of the user's own actions, shows notices (`components/ui/Toasts.jsx`)
  and refetches after a reconnect. A green dot next to the bell shows the connection state.
- Fallback: while connected, polling relaxes to 60 seconds; without a connection it is 15 seconds
  (`LIVE_REFRESH_MS`), plus a refetch whenever the tab regains focus.
- Measured with two browsers: an assignment reached the assignee in 0.3 s and a new handover in
  0.5 s after the submit returned.
- Config: `FRONTEND_ORIGIN` (comma-separated) sets the allowed socket origins; default
  `http://localhost:5173`.
