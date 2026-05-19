# DJ GNOME Focus — agent notes

GNOME Shell extension. Tiny surface — two files:
- `metadata.json` — UUID, shell-version matrix
- `extension.js` — registers a D-Bus interface on `/org/gnome/Shell/Extensions/DjFocus`

## When editing

- Shell-version matrix is `["47", "48", "49", "50"]`. Do not narrow without checking `gnome-shell --version`.
- `version` in metadata.json is only bumped when uploading to extensions.gnome.org. Local symlink-installs (via umbrella `install.sh`) don't care about it.
- Methods must return `GLib.Variant('(b)', [result])` for boolean returns, or `GLib.Variant('(s)', [json])` for string returns. The XML signature must match.
- Don't add dependencies on `Shell.WindowTracker` beyond `get_default()` + `get_windows()` — that's the stable subset.

## When testing

Wayland can't live-reload extensions. Options:
1. Log out + log in (slowest but deterministic)
2. Nested shell: `dbus-run-session -- gnome-shell --nested --wayland` — rarely needed for this extension
3. Call the D-Bus method directly to test without reloading the shell:
   ```bash
   gdbus call --session --dest org.gnome.Shell \
     --object-path /org/gnome/Shell/Extensions/DjFocus \
     --method org.gnome.Shell.Extensions.DjFocus.FocusTitle "Helix2000"
   ```

## Integration callers (wire up when needed)

Active integrations:
- `dj-cli/dj_cli/commands/video.py` — `dj video focus <pattern>` uses `FocusTitle`.
- `dj-cli/dj_cli/commands/terminals.py` — `dj terminals grid [preset]` uses `TileWindowByTitle` (PID-matching path is dormant; left in place for non-GApplication apps). Each Ptyxis window is launched with `--title "DJTile-N"` and matched by that unique title. Default 8 windows in 4×2 (OPEN_ITEMS #233's 1/8-tile convention); presets: `quad`, `duo`, `tower`, `six`, `wide`, `stack`. `dj terminals list-windows` uses `ListWindows`.
- `dj-cli/dj_cli/commands/windows_cmd.py` — `dj windows {list,active,focus,tile,move,minimize,close,workspace,tile-batch}` is the full surface. Backed by `dj_cli/windows.py` PyGObject `Gio.DBusProxy` client.
- `dj-mcp/dj_mcp/tools/windows.py` — 6 window tools + 2 mouse-warp tools registered as `dj_window_*` / `dj_mouse_warp_*` MCP tools.
- `dj-gnome-status` (top-bar) — Quick-actions submenu spawns `dj display N` / `dj terminals grid ...` / mouse-warp toggle.

## Method surface (current)

| Method | Signature | Notes |
|---|---|---|
| `FocusApp` | `(s) → b` | Lookup by GApp ID, focus most-recent window |
| `FocusTitle` | `(s) → b` | First window whose title contains substring (case-insensitive) |
| `TileWindowByPid` | `(i,d,d,d,d) → b` | Match by PID; fails for GApplication-backed apps (Ptyxis, gnome-terminal, nautilus) since Mutter reports the daemon PID |
| `TileWindowByTitle` | `(s,d,d,d,d) → b` | Match by title substring; pair with launchers that set unique titles |
| `ListWindows` | `() → s` | JSON array of `{wm_class, title, pid, id}` for every visible window |
| `GetActiveWindow` | `() → s` | JSON `{wm_class, title, pid, id, x, y, w, h, monitor}` for focused window (or `null`) |
| `MoveWindowByTitle` | `(s,i,i) → b` | Move (no resize) to absolute pixel position; unmaximizes first |
| `MinimizeByTitle` | `(s) → b` | Minimize first window matching substring |
| `CloseByTitle` | `(s) → b` | Polite `meta_window.delete()` — apps that prompt before close still prompt |
| `MoveToWorkspace` | `(s,i) → b` | Move first matching window to workspace index (0-based, range-checked) |
| `TileBatch` | `(s) → s` | Atomic batch tile. Input: JSON `[{title, x, y, w, h}]` (0..1 ratios). Output: `{placed: N, failed: [titles]}`. One D-Bus round trip vs N |

Hook integrations:
- `~/.claude/hooks/notification-focus.sh` — calls `FocusTitle "claude"` on Stop hook to pop the Claude Code window when work finishes / needs attention. Wire into `settings.json` `Stop` hook to use.

## Umbrella

Part of [`~/dev/gnome-extensions/`](../). Use the umbrella's `install.sh` to deploy — don't copy files into `~/.local/share/` by hand.
