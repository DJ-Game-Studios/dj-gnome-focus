# Known issues — dj-gnome-focus

Live bugs + workarounds. Update when fixed; don't remove the entry — strike through with a "fixed in v<N>" suffix.

## Tile path fails silently on GNOME 50 (Wayland) — current as of 2026-05-19

**Symptom:** `dj terminals grid` (and any consumer of `TileWindowByTitle` / `TileWindowByPid`) reports `[ok]` for each window and `Placed N/N windows.`, but visibly the windows end up:

- At their default-spawn position (often on a non-primary monitor)
- At their default spawn size — NOT in the requested tile rectangle

Same applies to the GUI consumer (`dj-gnome-status` extension → Quick Actions → terminal grid).

**Two contributing root causes:**

1. **`Meta.Window.unmaximize()` no-arg drift.** On GNOME Shell 50 / Mutter 50.1 (current target), `Meta.Window.unmaximize()` takes ZERO arguments. The extension code calls `target.unmaximize(Meta.MaximizeFlags.BOTH)` in 3 places:
   - `extension.js:217` — inside `_tileWindowByTitle`
   - `extension.js:273` — inside `_tileWindowByPid`
   - `extension.js:340` — inside `_moveWindowByTitle`

   Journal evidence:
   ```
   JS WARNING: file://.../extension.js:217:20: Too many arguments to method
   Meta.Window.unmaximize: expected 0, got 1
   ```

   The try/catch wraps it but the warning indicates the call didn't take. Subsequent `move_resize_frame` then either no-ops (if window was maximized) or partially completes against a stale internal state.

   **Fix:** drop the argument on all 3 lines. New signature is bare `target.unmaximize()`.

2. **Monitor targeting drift.** DJ reported (2026-05-19 PM) that the 8 windows came out **correct-size but on the wrong monitor**. This is independent of the unmaximize issue — `move_resize_frame` writes the right rectangle but Mutter places it relative to the window's current monitor, which may be the secondary monitor when Ptyxis spawned there. `TileWindowByTitle` should compute against the **primary** work area always (or take a monitor parameter); currently it uses whichever work area the window happens to be on.

   **Fix options (pick one when bandwidth):**
   - Compute against `workspace.get_work_area_for_monitor(primaryIdx)` instead of the window's current monitor's work_area
   - Add an optional `monitor` parameter to `TileWindowByTitle`
   - Always call `meta_window.move_to_monitor(primaryIdx)` before `move_resize_frame`

**Workaround until fixed:**

The MCP batch path (`dj_window_tile_batch`, via the `TileBatch` D-Bus method on this extension) does the same job correctly. Use that for any N-window grid layout. Codified in memory: `~/.claude/projects/-home-dj-dev/memory/feedback_mcp_window_tile_over_cli_grid.md`.

```bash
# spawn step still works (CLI is fine for launching with --title)
dj terminals grid

# then tile via MCP — same outcome as the CLI's broken tile step
# dj_window_tile_batch with the 4×2 ratio layout
```

**Why `TileBatch` works while `TileWindowByTitle` doesn't:** `TileBatch` computes against `primaryMonitor.workspace.work_area_for_monitor(primary.index)` for every window, so monitor targeting is explicit. The per-window method falls through to whichever monitor Mutter picks.

**Fix priority:** medium. Workaround is one MCP call; not blocking daily work. Worth fixing before the next dj-gnome-focus version bump (would land as v6).

## How to verify a fix

After landing edits to `extension.js`:

1. **Wayland re-login required** (extension code reload doesn't work without it).
2. Spawn 8 windows: `dj terminals grid --no-apply` (skip the broken tile step the CLI does).
3. From terminal, call the D-Bus method directly:
   ```bash
   gdbus call --session --dest org.gnome.Shell \
     --object-path /org/gnome/Shell/Extensions/DjFocus \
     --method org.gnome.Shell.Extensions.DjFocus.TileWindowByTitle \
     "DJTile-0" 0.0 0.0 0.25 0.5
   ```
4. Window should appear top-left quarter of primary monitor. Then verify the journal has zero `Too many arguments to method Meta.Window.unmaximize` warnings.
5. Re-run `dj terminals grid` — should now tile all 8 correctly without needing the MCP workaround.

## Cross-references

- `extension.js` — the source containing the 3 bug sites
- `INTERFACE.md` — D-Bus method matrix
- `reference_ptyxis_window_control_quirks` (Claude memory) — earlier same-week findings (auto-maximize, GApplication PID issues)
- OPEN_ITEMS #233 — terminal tile convention review (parent arc)
