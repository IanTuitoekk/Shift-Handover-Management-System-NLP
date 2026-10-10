# Frontend audit (before redesign)

Audited 10 October 2026 against the live backend (14 reports, 7 tasks, 3 users), as
`jane@kenya-airways.com` (ground crew) and `supervisor@kenya-airways.com` (supervisor).
Screenshots: `audit/before/` — login, dashboard and report detail for both roles, dark and
light, desktop (1440px) and tablet (834px). 20 images, no console errors.

## Structure today

```
src/
  App.jsx                    routes: /login, /register, / (dashboard), /reports/:id
  api/client.js              axios instance, token store, 401 handler, one function per endpoint
  auth/                      AuthContext, AuthProvider (/auth/me bootstrap), ProtectedRoute, GuestRoute
  hooks/useResource.js       fetch-with-key hook (stale-while-revalidate, null key skips) + useInterval
  components/                AppShell (header + drawer), StatusTiles, ReportsList, TasksPanel,
                             AssignControl, HandoverForm, NotificationsDrawer, ConfidenceBadge,
                             TextField, PasswordField, shell.css
  pages/                     LoginPage, RegisterPage, AuthLayout, DashboardPage, ReportDetailPage,
                             auth.css, dashboard.css, report.css
  styles/theme.css           colour tokens (light + dark via prefers-color-scheme), type, radius, space
  styles/global.css          base, buttons, fields, panels, badges, alerts, skeletons
  utils/format.js, config.js Intl formatting, shift maths, thresholds
```

The plumbing is sound: one API module, one theme file, Intl formatting, a small fetch hook,
real loading/empty/error branches in most panels. The problems are almost all in product
shape and visual language, not in the data layer.

## 1. Both roles get the same screen

This is the biggest problem. Jane and the supervisor land on an identical "Shift handover
board"; the only difference is the assign dropdown.

- **Ground crew see team-wide statistics** ("Reports this shift", "Needs review", "Open
  tasks: 4, 3 overdue") that they cannot act on. Red overdue counts for tasks that are not
  theirs create alarm without agency.
- **Ground crew's main job is buried.** On tablet the composer sits *below* 14 report rows
  (≈1,200px of scroll). The one thing they open the app to do is the hardest thing to reach.
- **"Mine" is barely represented.** "Assigned to you" is a small pill on one task row; there is
  no view of my tasks, my submissions, or what I should read from the previous shift.
- **Supervisors get no supervisory tools.** No way to see unassigned work, workload per
  person, a review queue, or filter reports. Assigning means scanning a stack of tall task
  cards, each with its own dropdown.
- **No navigation.** One page plus a detail view. There is nowhere to grow.

## 2. Visual hierarchy and layout

- **Everything is a bordered, shadowed card** — tiles, report list, composer, tasks, every
  detail section. Nothing reads as primary because everything has the same container.
  The report detail page is four identical stacked cards.
- **The navy band with tiles overlapping its edge is the SaaS-template move** (and it is lifted
  straight from the reference marketing site). In dark mode the band (#0b2138) is barely
  distinguishable from the page (#0e131a), so the overlap reads as a rendering glitch.
- **The report list is monotonous.** 13 near-identical rows ("Aircraft Equipment Problem /
  Hydraulic pump leak detected on B737 / 93%") with a hairline under each — no grouping by
  shift or day, no filtering, no way to find anything. "Today" and "3 Oct" are the only
  orientation.
- **Tasks panel is very tall per item.** Description, meta row, assign row and an actions row:
  ~200px per task on the supervisor view; four tasks fill 800px.
- **Task text is model boilerplate.** "New Aircraft Equipment Problem incident reported: …" is
  repeated on every task. The useful content starts 40 characters in.
- **Spacing rhythm is uneven.** Panel header padding (16/24) differs from body (24) differs
  from rows (16/24); tile internals use a third rhythm.

## 3. Typography

- IBM Plex Sans/Mono is a good, sober choice and stays. But the scale is loose: page title
  28px, tile values 36px, panel titles 18px, row titles 16px, meta 12px — five sizes with no
  clear ratio, and tile numbers out-shout the page title.
- Mono is used only for the row time. Counts, confidence and dates use proportional figures in
  places (`.num` is applied inconsistently), so columns of numbers do not align.
- Confidence is a bare "93%" grey pill — text only, identical on every row, so it carries no
  signal until it drops below 60%.

## 4. Colour

- Calm blue for interaction and red reserved for critical is the right rule and is mostly
  respected. But red is the **only** status colour with meaning; "pending", "assigned",
  "unassigned" have no visual language at all.
- The navy band is a second "brand" colour competing with the blue accent.
- Dark mode was derived from light, not designed: surfaces are only 3–6% apart in lightness,
  so the panel stack is held together by borders rather than by surface steps.

## 5. Accessibility (measured)

| Issue | Measured | Rule |
|---|---|---|
| Input borders (`--color-border-strong`) on surface | 1.77:1 light, 1.81:1 dark | Fails 3:1 non-text contrast (WCAG 1.4.11) |
| Panel/row dividers | 1.32:1 light, 1.34:1 dark | Decorative, acceptable, but they carry the whole layout |
| Placeholder text (`--color-text-subtle`) light | 4.47:1 | Just under 4.5:1 |
| `#ED1C24` used as text on surfaces | 4.30:1 light, 3.91:1 dark | Only passes at large size; small critical text correctly uses `--color-critical-text` |
| Small buttons (`.btn-sm`) | 32px tall | Below the 44px target required for ground crew views |
| Icon buttons (bell, password toggle) | 40px | Below 44px |
| "Open report" / "View alerts" | text-sized links | Small hit area on tablet |

Good: visible `:focus-visible` rings everywhere, skip link, native `<dialog>` for the drawer
(focus trap, Esc), `aria-live` on form results, labelled inputs, reduced-motion guard on the
few animations, `Intl` dates.

Gaps: no theme control and dark mode is not the default (it follows the OS, so a light-OS
tablet in a hangar at night gets light mode); the confidence state is conveyed by colour and
a word only on low scores; skeletons pulse but do not match final row shapes on the detail page.

## 6. States and interactions

- **Loading:** skeletons exist on lists; the detail page header shows "Loading report…" text.
- **Empty:** present but generic ("No open tasks"), with no next action.
- **Error:** inline with retry on most panels; the dashboard has no page-level offline state.
- **After submitting a handover** the user gets a one-line success message and a link. The
  model's category, confidence and extracted entities — the whole point of the NLP step —
  are not shown until you click through.
- **No draft persistence.** A half-written handover is lost on reload or logout (there is a
  `beforeunload` guard only).
- **Resolve confirmation** is good (two-step). Assign now requires a button press, also good.
- **Polling** every 60s refetches four resources even when nothing changed; acceptable at this
  data size.
- **Overdue rule** is a flat 12 hours; with real data, 3 of 4 open tasks are "overdue" because
  they are a week old, so the red state is permanently on and loses meaning.

## 7. What already works

- Single theme file with light/dark tokens; red reserved for critical.
- Clean data layer and consistent `Intl` formatting.
- Focus management, dialog drawer, live regions.
- Two-step resolve and explicit Assign button.
- Sentence case throughout after the last pass.

## Prioritised fix list

1. **Split the experience by role** with role-specific home, navigation and guards. Ground
   crew: composer first, "mine" second. Supervisor: attention-first overview and triage.
2. **Make the composer the ground-crew hero** with draft persistence, completeness hints and a
   rich result card showing category, confidence, entities and summary.
3. **Give supervisors triage tools:** unassigned/assigned/overdue lanes, workload per person,
   review queue, filters.
4. **Replace the card-everywhere language** with a small set of surface levels (page, raised,
   inset) and dividers; remove the navy band.
5. **Fix contrast:** input borders to ≥3:1, placeholder ≥4.5:1, and 44px touch targets on
   ground-crew views.
6. **Dark mode as the default** with an explicit theme switch, and a dark palette designed
   with real surface steps.
7. **Confidence as a visual meter**, consistent status badges with icons, tabular numerals
   everywhere a number appears.
8. **Group and filter reports** by shift/day, category, confidence and date.
9. **Strip task boilerplate** in the UI so the useful text leads.
10. **Considered empty states with next actions**, skeletons that match final layouts, and
    page-level error/retry.
