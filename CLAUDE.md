# DJ GNOME Focus — agent notes

GNOME Shell extension. Tiny surface — two files:
- `metadata.json` — UUID, shell-version matrix
- `extension.js` — registers a D-Bus interface on `/org/gnome/Shell/Extensions/DjFocus`

## When editing

- Shell-version matrix is `["47", "48", "49", "50"]`. Do not narrow without checking `gnome-shell --version`.
- `version` in metadata.json is only bumped when uploading to extensions.gnome.org. Local symlink-installs (via umbrella `install.sh`) don't care about it.
- Methods must return `GLib.Variant('(b)', [result])` — single-bool tuple, or D-Bus will reject.
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
- `dj-cli/dj_cli/commands/terminals.py` — `dj terminals grid` uses `TileWindowByPid` to drop N Ptyxis windows into an arbitrary cols×rows grid on the primary work area. Default 8 windows in 4×2 (OPEN_ITEMS #233's 1/8-tile convention).

Future homes:
- `~/.claude/hooks/notification-focus.sh` — Claude Code Notification hook

## Umbrella

Part of [`~/dev/gnome-extensions/`](../). Use the umbrella's `install.sh` to deploy — don't copy files into `~/.local/share/` by hand.
