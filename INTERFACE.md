# D-Bus Interface — dj-gnome-focus

## Overview

The dj-gnome-focus GNOME Shell extension exposes a D-Bus interface for window focus operations on Wayland. This enables CLI tools and external scripts to programmatically switch focus to windows by app ID or title pattern.

## Bus Details

- **Bus Type**: Session bus
- **Destination**: `org.gnome.Shell`
- **Object Path**: `/org/gnome/Shell/Extensions/DjFocus`
- **Interface**: `org.gnome.Shell.Extensions.DjFocus`

## Methods

### FocusApp

Focus a window by application ID (`.desktop` filename).

**Signature**: `FocusApp(appId: string) → boolean`

**Parameters**:
- `appId` (string): The application ID (e.g., `code_code.desktop`, `firefox.desktop`)

**Returns**:
- `success` (boolean): `true` if window was focused, `false` if app not found or has no windows

**Example**:
```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusApp \
  "code_code.desktop"
```

### FocusTitle

Focus a window by title substring (case-insensitive).

**Signature**: `FocusTitle(substring: string) → boolean`

**Parameters**:
- `substring` (string): Substring to match against window titles (case-insensitive)

**Returns**:
- `success` (boolean): `true` if a matching window was focused, `false` if no match found

**Example**:
```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusTitle \
  "Helix2000"
```

### TileWindowByPid

Move and resize a window — identified by its owning process PID — to a rectangle expressed as 0..1 ratios of the primary monitor's active work area.

**Signature**: `TileWindowByPid(pid: int32, xRatio: double, yRatio: double, wRatio: double, hRatio: double) → boolean`

**Parameters**:
- `pid` (int32): PID of the process that owns the target window (`Meta.Window.get_pid()` matches this)
- `xRatio`, `yRatio` (double): Top-left corner as a fraction of the work area (0..1)
- `wRatio`, `hRatio` (double): Width / height as a fraction of the work area (0..1)

**Returns**:
- `success` (boolean): `true` if a window matched the PID and was repositioned, `false` if no match.

The method computes absolute coordinates from `workspace.get_work_area_for_monitor(primary)`, so it adapts to monitor-layout changes (`dj video layout 1/2/3`) without the caller needing to know pixel geometry. If the target is maximized, it is unmaximized first.

**Example** — tile the window owned by pid 12345 to the top-left quarter of the primary monitor:

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.TileWindowByPid \
  12345 0.0 0.0 0.5 0.5
```

**Pairing with Ptyxis**: Ptyxis defaults to a single-instance GApplication, so `subprocess.Popen(["ptyxis", "--new-window"])` returns a short-lived launcher PID, not the window's owning PID. Pass `--standalone` to spawn a real per-window process whose PID can be matched.

## Integration with dj-cli

| dj-cli command | Method used |
|---|---|
| `dj video focus <pattern>` | `FocusTitle` |
| `dj terminals grid` | `TileWindowByPid` (1/8-tile 4×2 grid per OPEN_ITEMS #233) |

## Testing

Test the interface directly without reloading the shell:

```bash
# Test with a known window title
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusTitle \
  "test"

# Expected output: (false,) if no window matches, (true,) if found
```

## Error Handling

- If the extension is not enabled, the D-Bus call will fail with `org.freedesktop.DBus.Error.UnknownMethod`
- If no window matches the pattern, the method returns `(false,)`
- The extension must be enabled via `gnome-extensions enable dj-gnome-focus@djmsqrvve`

## Implementation Notes

- The extension uses `Shell.WindowTracker.get_default()` and `global.get_window_actors()` to enumerate windows
- Window matching is case-insensitive for `FocusTitle`
- For `FocusApp`, the most recently used window of the app is focused
- All methods return a single-bool tuple `GLib.Variant('(b)', [result])` per D-Bus requirements
