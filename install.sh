#!/usr/bin/env bash
# install.sh — self-contained installer for dj-gnome-focus.
#
# Symlinks this repo into ~/.local/share/gnome-shell/extensions/<uuid>,
# compiles GSettings schemas if schemas/*.xml is present, and enables the
# extension via `gnome-extensions enable`. Idempotent and side-by-side
# with the umbrella installer at ~/dev/gnome-extensions/install.sh.
#
# Why per-extension? So each extension is self-installable on hosts that
# don't carry the umbrella ~/dev parent repo (e.g. the retired box).
# See master-track/handoffs/2026-05-20-cross-fleet-git-status-arc.md
# (TODO-7 for the umbrella-asymmetry context).
#
# Usage:
#   ./install.sh              # symlink + compile + enable
#   ./install.sh --uninstall  # disable + unlink (source untouched)
#   ./install.sh --reload     # disable + enable cycle (no symlink change)
set -euo pipefail

UUID="dj-gnome-focus@djmsqrvve"
SRC="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
DST="$EXT_DIR/$UUID"

mkdir -p "$EXT_DIR"

action="${1:-install}"

case "$action" in
  --uninstall|uninstall)
    gnome-extensions disable "$UUID" 2>/dev/null || true
    if [[ -L "$DST" ]]; then
      rm "$DST"
      echo "unlinked $UUID"
    else
      echo "skip: $DST is not a symlink (leaving alone)"
    fi
    ;;
  --reload|reload)
    gnome-extensions disable "$UUID" 2>/dev/null || true
    sleep 0.5
    gnome-extensions enable "$UUID" 2>/dev/null || {
      echo "could not enable — Wayland logout/login may be required"
      exit 1
    }
    echo "reloaded $UUID"
    ;;
  *)
    if [[ -e "$DST" && ! -L "$DST" ]]; then
      backup="${DST}.pre-symlink.$(date +%s)"
      mv "$DST" "$backup"
      echo "backed up existing $UUID to $backup"
    fi
    ln -sfn "$SRC" "$DST"
    echo "linked $UUID -> $SRC"

    if [[ -d "$SRC/schemas" ]] && compgen -G "$SRC/schemas/*.xml" >/dev/null; then
      glib-compile-schemas "$SRC/schemas/" && echo "schemas compiled"
    fi

    if gnome-extensions enable "$UUID" 2>/dev/null; then
      echo "enabled $UUID"
    else
      echo "could not auto-enable $UUID — log out + back in (Wayland), then re-run --reload"
    fi

    echo
    echo "If first install on this host, log out + back in (Wayland) for"
    echo "GNOME Shell to pick up the new extension symlink."
    ;;
esac
