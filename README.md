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

## Why

Wayland forbids arbitrary window manipulation from unprivileged clients (wmctrl, xdotool, etc.). A GNOME Shell extension runs *inside* Mutter, so it can. This extension exposes those capabilities over session D-Bus so CLIs and hooks can raise + position windows. Use `FocusId` to return to an exact window even if its title changes during an operation.

## Usage

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

## License

MIT.
