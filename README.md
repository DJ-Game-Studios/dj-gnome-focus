# DJ GNOME Focus

A GNOME Shell extension that exposes precise window activation and tiling over D-Bus on Wayland.

Wayland intentionally prevents ordinary desktop applications from manipulating other windows. Because this extension runs inside GNOME Shell, approved local tools can request operations through a small, explicit interface instead of relying on X11-only utilities such as `wmctrl` or `xdotool`.

## Capabilities

| Method | Purpose |
| --- | --- |
| `FocusApp(appId)` | Activate the most recent window for a desktop application. |
| `FocusTitle(substring)` | Activate a window by case-insensitive title match. |
| `FocusId(windowId)` | Activate an exact window using its Mutter ID. |
| `TileWindowByPid(...)` | Move and resize a window using normalized work-area coordinates. |
| `TileWindowByTitle(...)` | Tile a window when application PIDs are indirect or unstable. |
| `ListWindows()` | Return visible window metadata as JSON. |
| `GetActiveWindow()` | Return metadata for the currently active window. |
| `PointerStatus()` | Report whether the guarded pointer capability is available. |
| `PlanPointerClick(...)` | Validate a narrowly scoped click request without injecting input. |
| `CommitPointerClick(planId)` | Execute one unexpired, revalidated primary click. |

See [INTERFACE.md](INTERFACE.md) for the complete D-Bus contract and return schemas.

## Install

Clone the repository, then run:

```bash
./install.sh
```

Log out and back in on Wayland so GNOME Shell loads the extension. On X11, restart the shell with <kbd>Alt</kbd>+<kbd>F2</kbd>, then `r`.

Useful commands:

```bash
./install.sh --reload
./install.sh --uninstall
```

Extension UUID: `dj-gnome-focus@djmsqrvve`

## Example

Activate the most recent Visual Studio Code window:

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusApp \
  "code_code.desktop"
```

List the visible windows:

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.ListWindows
```

## Safety model

Window focus and pointer input are separate capabilities. Pointer actions use a two-step plan/commit flow with expiry, one-shot IDs, target identity checks, geometry checks, focus checks, and human-pointer revalidation. The interface does not expose arbitrary keyboard input or unrestricted coordinate clicking.

Applications integrating the extension should prefer exact window IDs, verify the active target before acting, and avoid storing sensitive window titles in logs.

## Development

The repository includes structural and policy-focused tests for the D-Bus interface, lifecycle cleanup, focus behavior, window matching, and guarded pointer planning.

Known limitations and platform notes are tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## License

See [LICENSE](LICENSE).
