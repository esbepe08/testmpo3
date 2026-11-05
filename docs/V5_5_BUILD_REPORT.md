# EAS v5.5: Layout refinement and Tahkim consensus system

## What changed

| # | Request | Implementation |
|---|---|---|
| 1 | Offline Pause button | New dedicated `#bPause` in the button rack (Game Tools in the Floating Workspace). It is not inside a player panel, so rack/panel size can not move it. Hidden online (the match panel has its own). Clock tap and **P** still work. |
| 2 | Resizable match panel | `#netBar` is now a workspace module (`def: net`): drag by the grip, resize from the corner on both axes, position and size saved per orientation, double-click grip resets. A room-code chip (`#netRoom`, tap to copy) was added. |
| 3 | Discussion | `request_tahkim` opens one shared session at once (no approval step). Window `js/online/tahkim-ui.js`: reason, chat, selections, rules, minimize / reopen (`#bJudge` also reopens). |
| 4 | Persistence | Everything lives in `games.tahkim` (jsonb): reason, words, votes, chat. A refresh / reconnect redraws it from the snapshot. No expiry: `TAHKIM_APPROVE_MS/RULE_MS` and `tahkimDue` were removed. Chat/votes are idempotent by `client_action_id`. |
| 5 | Mutual agreement | `tahkim_vote` (`valid` / `invalid` / `null`). Resolves only when both selections are equal, inside the same commit (revision compare-and-set). Selections can change or be withdrawn until then. |
| 6 | Lock | Server: every gameplay action is refused (`TAHKIM_PENDING`). Client: `html[data-tahkim]` disables board and racks. Clocks stop on request and restart only on resolution. |
| 7 | Records | `games.ext.tahkim_log` (word, initiator, reason, verdict, players, time), shown in "سجل التحكيم" under the Word Log, identical on both screens, written once. |
| 8 | Rules panel | `js/tahkim-rules.js`: five accordion categories built from `config.js` / `modes.js` constants and `wordrules.js`. Open/closed state is per device. |
| 9 | Responsive | Portrait phone: bottom sheet. Landscape / short: side sheet; below 480 px high the rules replace the chat while verdict and message box stay. |
| 10 | Tests | See below. |

## Decisions to know about
* The **challenger is still the player on turn** (as in local play): only they can open a Tahkim, on the opponent's last move.
* `cancel_tahkim`, `respond_tahkim`, `resolve_tahkim` were **removed**: a unilateral withdrawal would be a unilateral outcome. A deadlock is ended with the existing surrender, or `claim_abandon` (now valid against the opposite player in Tahkim after 5 min of silence).
* The existing 24 h housekeeping function that abandons a game idle for a day still applies (database hygiene, not a Tahkim timer).
* No SQL migration is needed. App version is **5.5**; the service worker cache was re-stamped.
* Local (offline) judging is unchanged.

## Tests
* New `tests/online/tahkim-consensus.mjs` (51 checks): all agreement scenarios, change/withdraw, chat, lock, clocks, once-only resolution, simultaneous votes, reconnect, abandon, surrender, records.
* `tests/e2e/run.py` (102 checks, two real browsers): shared discussion, chat, per-player minimize and rules, refresh mid-discussion, disagreement then agreement, match-panel resize and reset.
* `tests/e2e/pause-button.py` (46 checks): desktop, tablet, phone portrait and landscape.
* Three checks that were already failing on v5.4 are fixed: `e2e/local.py` (the cover's support link is `#coverDonate`; `#donT` no longer exists), `layout/float_modules.py` (the end-of-game list has 7 items) and `pwa/e2e.mjs` (installability is now checked in a persistent, non-incognito profile).
* `layout/tools.mjs` and `layout/collapse.mjs` now expect the new `bPause` button in Game Tools.
* `tests/run-all.mjs` prints the name and exit code of every failing suite.
* Known and unchanged from v5.4: `layout/history-toggle.mjs` fails 9 pixel-baseline checks (panel heights differ with the fonts of the test machine; v5.5 adds one expected difference: 9 buttons in `.ctrls`, because of Pause), `layout/feel.mjs` hits a Chrome protocol timeout on a slow machine, and `logic/engine.mjs` / `logic/startup.mjs` need `jsdom`, which was not installable offline. Run them with `npm ci` in `tests/` on your machine.
