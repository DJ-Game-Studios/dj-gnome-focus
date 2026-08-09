# DJ GNOME Focus

D-Bus window-control service for GNOME Shell on Wayland. Exposes focused window-management methods on `org.gnome.Shell.Extensions.DjFocus`:

| Method | Args | Returns |
|--------|------|---------|
| `FocusApp(appId: string)` | desktop ID (e.g. `code_code.desktop`) | `bool` — true if a window was activated |
| `FocusTitle(substring: string)` | case-insensitive title substring | `bool` |
| `FocusId(windowId: uint32)` | stable Mutter ID from `ListWindows`/`GetActiveWindow` | `bool` |
| `TileWindowByPid(pid: int, xR, yR, wR, hR: double)` | owning process PID + 0..1 ratios of primary work area | `bool` — fails for GApplication-backed apps (use title instead) |
| `TileWindowByTitle(substring: string, xR, yR, wR, hR: double)` | title substring + 0..1 ratios | `bool` — robust against GApplication daemon PID indirection |
| `ListWindows()` | — | `string` — JSON array of `{wm_class, title, pid, id}` for every visible window |
| `PointerStatus()` | — | `string` — read-only JSON capability/state |
| `PlanPointerClick(requestJson: string)` | exact ID/title/class + normalized point + intent/TTL | `string` — no-input JSON plan with a secret ID |
| `CommitPointerClick(planId: string)` | one unexpired plan ID | `string` — one-shot primary click after all safety rechecks |

## Why

Wayland forbids arbitrary window manipulation from unprivileged clients (wmctrl, xdotool, etc.). A GNOME Shell extension runs *inside* Mutter, so it can. This extension exposes those capabilities over session D-Bus so CLIs and hooks can raise + position windows. Focus routes use GNOME Shell's workspace-aware activation helper; use `FocusId` to return to an exact window even if its title changes during an operation.

Pointer injection is a separate two-phase capability: planning is dry-run only,
and commit is left-click-only with expiry plus exact identity, geometry, focus,
and human-pointer rechecks. It does not automate credentials or keyboard/game
input.

## Agent automation boundary

This repository is the compositor bridge, not the agent-facing API. Agents use
`desktop-windows@box-1` / `dj windows` for window operations and the on-demand
`desktop-input@box-1` MCP for reviewed pointer intents. They do not call this
D-Bus object directly and do not fall back to `xdotool`, `wmctrl`, or arbitrary
desktop coordinates.

The pointer source is **pinned pending activation**: extension assertions and
MCP policy units are green, but the real MCP stdio handshake timed out in the
2026-07-22 restricted validation. Its Shell code has not been loaded and no
live click has been accepted. Resolve transport first, then wait for a normal
GNOME login; do not force a reload after the 2026-07-22 Shell crashes. A future domain wrapper must snapshot original focus,
focus/verify its exact policy-owned target, plan and commit one intent, then
restore in `finally` while preserving newer user focus.

## Maintainer-only D-Bus diagnostics

The raw calls below are for bridge maintainers. Agent and product workflows use
the serving CLI/MCP surfaces above.

```bash
# Raise the most-recently-used VS Code window
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusApp \
  "code_code.desktop"

# Raise a window by title substring (case-insensitive)
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusTitle \
  "Helix2000"

# Tile a window (owned by pid 12345) to the top-left quarter of the primary monitor
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.TileWindowByPid \
  12345 0.0 0.0 0.5 0.5
```

## Status: active

Enabled in GNOME Shell on main-pc (Node-2). Consumers:

- `dj video focus <pattern>` — wraps `FocusTitle`
- `dj terminals grid` — wraps `TileWindowByTitle` to drop 8 Ptyxis windows (each launched with a unique `--title "DJTile-N"`) into a 4×2 tile layout (1/8-tile convention, OPEN_ITEMS #233)
- `dj terminals list-windows` / `dj terminals status` — wrap `ListWindows` for debugging tile matchers
- desktopmng's on-demand `input` MCP group — wraps the two-phase pointer methods

Future homes still on the table:
- Claude Code `Notification` hook that raises the triggering window
- Stream overlay "focus scene N" hotkey
- Drag-free fleet-window layouts (LCC + dashboards in a preset tile arrangement)

## Install

```bash
./install.sh              # symlink + compile schemas + enable
./install.sh --uninstall  # disable + unlink (source untouched)
./install.sh --reload     # disable + enable cycle (no symlink change)
```

Or via the umbrella `~/dev/gnome-extensions/install.sh` to install **all** dj-* extensions at once (delegates to each member's `install.sh`).

After install, log out + back in on Wayland (or `Alt+F2` `r` on X11) for GNOME Shell to pick up the symlink. UUID: `dj-gnome-focus@djmsqrvve`.

## Next normal-login acceptance — 2026-08-08

The source-linked install now routes `FocusApp`, `FocusTitle`, and `FocusId`
through GNOME Shell's workspace-aware `Main.activateWindow`. Static assertions
pass, and same-workspace stable-ID focus/restore passed against WoW and Codex.
The running Wayland Shell still has the older implementation loaded; do not
force-reload it.

After the next normal logout/login:

1. Put an exact test target and the original terminal on different non-sticky
   workspaces. `ListWindows` must report two different indexes `>= 0`; `-1`
   means the window is visible on every workspace and does not test switching.
2. Use the owning domain adapter, not raw D-Bus, to focus/capture/restore once.
3. Require the target's exact stable ID to become active and the original exact
   ID/PID/class to be restored, including across a changing terminal title.
4. Re-read active focus and visually inspect the returned image.
5. If the user chooses a third window, preserve it and require no published
   capture.

For the current WoW acceptance, the owning runbook is
`~/dev/mcp-dev/docs/WOW_ADDON_DESKTOP_VQA.md`.

## License

MIT.
