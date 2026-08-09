# D-Bus Interface — dj-gnome-focus

## Overview

The dj-gnome-focus GNOME Shell extension exposes a D-Bus interface for window focus operations on Wayland. This enables CLI tools and external scripts to programmatically switch focus to windows by app ID or title pattern. Focus methods use GNOME Shell's workspace-aware activation helper, so an exact window on another workspace is activated without relocating it.

Agents do not call this interface directly. `~/dev/dj-cli` and
`~/dev/mcp/core/desktopmng` are the serving implementations; focus-sensitive
domain transactions are documented in
`~/dev/mcp-dev/docs/DESKTOP_UI_VQA.md`. Pointer plan/commit remains pinned until
a normal login loads the source and a bounded live acceptance is approved.

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

### FocusId

Focus the exact Mutter window ID returned by `ListWindows` or `GetActiveWindow`. Unlike a title matcher, the ID remains stable while terminal spinners, document names, and game modes change the title.

**Signature**: `FocusId(windowId: uint32) → boolean`

Use this as the focus-back primitive for a bounded UI transaction: snapshot the active ID, perform the operation on another window, call `FocusId`, then verify `GetActiveWindow` reports the original ID/PID/class.

`FocusId`, `FocusTitle`, and `FocusApp` switch to the target's workspace through
GNOME Shell before activation. Source changes become live only after a normal
Wayland login; do not treat an installed symlink as proof that the running Shell
loaded the new implementation.

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

**Pairing with Ptyxis**: Even with `--standalone`, Ptyxis (and other GApplication-backed apps like gnome-terminal, nautilus) report the system-wide GApplication daemon PID via `Meta.Window.get_pid()`. PID matching therefore fails for these. Use `TileWindowByTitle` instead — combined with `ptyxis --title "DJTile-N"` to give each window a unique matcher.

### TileWindowByTitle

Move and resize the first window whose title contains `substring` (case-insensitive). Same rectangle semantics as `TileWindowByPid`.

**Signature**: `TileWindowByTitle(substring: string, xRatio: double, yRatio: double, wRatio: double, hRatio: double) → boolean`

**Example** — tile the window titled "DJTile-3" to the bottom-right quarter of the primary monitor:

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.TileWindowByTitle \
  "DJTile-3" 0.5 0.5 0.5 0.5
```

### ListWindows

Dump all visible windows as a JSON string. Each entry: `{wm_class, title, pid, id}`. Useful for debugging title/PID matchers.

**Signature**: `ListWindows() → string`

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.ListWindows
```

### GetActiveWindow

Return the currently focused window as a JSON string. Shape:
`{wm_class, title, pid, id, x, y, w, h, monitor}`. Returns the string `null` (JSON literal) if no window is focused. Added in v4.

**Signature**: `GetActiveWindow() → string`

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.GetActiveWindow
```

### MoveWindowByTitle

Move a window to absolute pixel `(x, y)` without resizing. Unmaximizes first. Added in v4.

**Signature**: `MoveWindowByTitle(substring: string, x: int32, y: int32) → boolean`

### MinimizeByTitle

Minimize the first window whose title contains `substring`. Added in v4.

**Signature**: `MinimizeByTitle(substring: string) → boolean`

### CloseByTitle

Polite close (`meta_window.delete(time)`) — apps that prompt before exit still prompt. Added in v4.

**Signature**: `CloseByTitle(substring: string) → boolean`

### MoveToWorkspace

Move the first matching window to the given workspace index (0-based, range-checked). Added in v4.

**Signature**: `MoveToWorkspace(substring: string, workspace: int32) → boolean`

### TileBatch

Atomic batch tile. Input is a JSON array of `{title, x, y, w, h}` (ratios 0..1 of the primary work area). Output is a JSON object `{placed: N, failed: [titles]}`. One D-Bus round trip for N windows — much cheaper than N sequential `TileWindowByTitle` calls, and removes any mid-loop race for callers that fire them in sequence. Added in v4.

**Signature**: `TileBatch(json: string) → string`

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.TileBatch \
  '[{"title":"DJTile-0","x":0,"y":0,"w":0.5,"h":0.5},{"title":"DJTile-1","x":0.5,"y":0,"w":0.5,"h":0.5}]'
```

### GetMonitors

Return full Mutter monitor topology as a JSON string. Shape:
`{primary: idx, count: N, monitors: [{index, primary, geometry: {x,y,w,h}, work_area: {x,y,w,h}, scale}, ...]}`. Use to do absolute-pixel tile math against non-primary monitors. Added in v5.

**Signature**: `GetMonitors() → string`

### TileByTitlePixels

Absolute-pixel placement. Bypasses the primary-work-area math of `TileWindowByTitle` — caller specifies exact pixels. Useful when targeting non-primary monitors (e.g. the TV at HDMI-1) or when ratios round inconveniently. Added in v5.

**Signature**: `TileByTitlePixels(substring: string, x: int32, y: int32, w: int32, h: int32) → boolean`

### PointerStatus

Read-only capability and pointer state. Reports whether Mutter exposes virtual
pointer creation, current logical-pixel coordinates, whether a plan is pending,
and the enforced safety constraints. The secret plan ID is never returned here.

**Signature**: `PointerStatus() → string`

### PlanPointerClick

Create a no-input, expiring click plan for one exact Mutter window. The JSON
request must contain only:

```json
{
  "schema_version": 1,
  "window_id": 123,
  "expected_title": "Battle.net",
  "expected_wm_class": "battle.net.exe",
  "x_ratio": 0.175,
  "y_ratio": 0.788,
  "intent": "battle.net:account-menu",
  "ttl_ms": 10000
}
```

Coordinates are normalized inside the current window frame and must be within
`0.01..0.99`. The response contains the exact target identity, geometry,
resolved desktop logical pixel, pointer position, focus check, and a secret
plan ID. Planning does not focus, move, click, or otherwise mutate the desktop.

**Signature**: `PlanPointerClick(requestJson: string) → string`

### CommitPointerClick

Consume one plan exactly once. Before injecting anything, the extension
rechecks expiry, stable window ID, exact title/class, unchanged frame geometry,
the target's active focus, and that the human pointer has not moved by more
than two pixels. It repeats the mutable-state checks immediately before input,
then sends one primary-button click through Mutter's virtual pointer. A
successful press always enters a `finally` release path; an uncertain release
discards the virtual-device reference. Failed checks still consume the plan.

**Signature**: `CommitPointerClick(planId: string) → string`

The initial surface deliberately has no keyboard, drag, scroll, double-click,
button selector, title matching, focus mutation, or arbitrary command input.

## Integration with dj-cli

| dj-cli command | Method used |
|---|---|
| `dj video focus <pattern>` | `FocusTitle` |
| `dj terminals grid [preset]` | `TileWindowByTitle` (1/8-tile 4×2 grid per OPEN_ITEMS #233) |
| `dj terminals list-windows` | `ListWindows` |
| `dj terminals status` | `ListWindows` (for `DJTile-*` window enumeration) |
| `dj windows list` | `ListWindows` |
| `dj windows active` | `GetActiveWindow` |
| `dj windows focus <pattern>` | `FocusTitle` |
| `dj windows focus-id <window-id>` | `FocusId` |
| `dj windows tile <pattern> X Y W H` | `TileWindowByTitle` |
| `dj windows move <pattern> X Y` | `MoveWindowByTitle` |
| `dj windows minimize <pattern>` | `MinimizeByTitle` |
| `dj windows close <pattern>` | `CloseByTitle` |
| `dj windows workspace <pattern> N` | `MoveToWorkspace` |
| `dj windows tile-batch <json>` | `TileBatch` |

## Integration with dj-mcp

| MCP tool | Method used |
|---|---|
| `dj_window_list` | `ListWindows` (via `dj windows list --json`) |
| `dj_window_active` | `GetActiveWindow` |
| `dj_window_focus` | `FocusTitle` |
| `dj_window_tile` | `TileWindowByTitle` |
| `dj_window_close` | `CloseByTitle` |
| `dj_window_tile_batch` | `TileBatch` |
| `dj_monitors_list` | `GetMonitors` (also via `dj video state --json` / Mutter DisplayConfig) |
| `dj_pointer_status` | `PointerStatus` |
| `dj_pointer_plan_click` | `PlanPointerClick` |
| `dj_pointer_commit_click` | `CommitPointerClick` |

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
- Boolean-returning methods use `GLib.Variant('(b)', [result])`; `ListWindows` uses `GLib.Variant('(s)', [json])`. The XML signature drives the marshal.
