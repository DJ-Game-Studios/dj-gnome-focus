# DJ GNOME Focus

D-Bus window-activation service for GNOME Shell on Wayland. Exposes two methods on `org.gnome.Shell.Extensions.DjFocus`:

| Method | Arg | Returns |
|--------|-----|---------|
| `FocusApp(appId: string)` | desktop ID (e.g. `code_code.desktop`) | `bool` — true if a window was activated |
| `FocusTitle(substring: string)` | case-insensitive title substring | `bool` |

## Why

Wayland forbids arbitrary window activation from unprivileged clients. A GNOME Shell extension runs *inside* the compositor, so it can raise windows legitimately. This extension is a thin shim that exposes that capability over session D-Bus so CLIs and notification hooks can raise the right window.

## Usage

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusApp \
  "code_code.desktop"

gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/DjFocus \
  --method org.gnome.Shell.Extensions.DjFocus.FocusTitle \
  "Helix2000"
```

## Status: installed, integration pending (as of 2026-04-24)

The extension is enabled in GNOME Shell. Nothing in `~/dev` calls it yet. Planned integrations:

- `dj focus <app-id>` subcommand in dj-cli
- Claude Code `Notification` hook that raises the triggering window
- Stream overlay "focus scene N" hotkey

Filed under `~/dev/studio-ops/planning/OPEN_ITEMS.md` — search for `dj-gnome-focus`.

## Install

From the umbrella (`~/dev/gnome-extensions/`):

```bash
./install.sh
```

This symlinks the repo into `~/.local/share/gnome-shell/extensions/dj-gnome-focus@djmsqrvve` and enables it. Log out + back in on Wayland to reload.

## License

MIT.
