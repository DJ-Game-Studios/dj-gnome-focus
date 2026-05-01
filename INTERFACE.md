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

## Integration with dj-cli

The `dj video focus` command wraps the `FocusTitle` method:

```bash
dj video focus Helix2000
```

This is equivalent to the gdbus call above, with user-friendly output.

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
