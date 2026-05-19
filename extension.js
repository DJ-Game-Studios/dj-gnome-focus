/**
 * DJ GNOME Focus — D-Bus window-control service for Wayland.
 *
 * Methods on org.gnome.Shell.Extensions.DjFocus:
 *   FocusApp(appId: string) → boolean
 *   FocusTitle(substring: string) → boolean
 *   TileWindowByPid(pid: int32, xRatio, yRatio, wRatio, hRatio: double) → boolean
 *   TileWindowByTitle(substring: string, xRatio, yRatio, wRatio, hRatio: double) → boolean
 *   ListWindows() → string  (JSON: [{wm_class, title, pid, id}, ...])
 *   GetActiveWindow() → string  (JSON: {wm_class, title, pid, id, x, y, w, h, monitor})
 *   MoveWindowByTitle(substring: string, x, y: int32) → boolean
 *   MinimizeByTitle(substring: string) → boolean
 *   CloseByTitle(substring: string) → boolean
 *   MoveToWorkspace(substring: string, workspace: int32) → boolean
 *   TileBatch(json: string) → string
 *       Input  : [{title, x, y, w, h}, ...]  (ratios 0..1 of primary work area)
 *       Output : {placed: N, failed: [titles...]}
 *
 * Wayland forbids arbitrary window manipulation from unprivileged clients.
 * Extensions run inside Mutter, so they can.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

const IFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.DjFocus">
    <method name="FocusApp">
      <arg type="s" direction="in" name="appId"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="FocusTitle">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="TileWindowByPid">
      <arg type="i" direction="in" name="pid"/>
      <arg type="d" direction="in" name="xRatio"/>
      <arg type="d" direction="in" name="yRatio"/>
      <arg type="d" direction="in" name="wRatio"/>
      <arg type="d" direction="in" name="hRatio"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="TileWindowByTitle">
      <arg type="s" direction="in" name="substring"/>
      <arg type="d" direction="in" name="xRatio"/>
      <arg type="d" direction="in" name="yRatio"/>
      <arg type="d" direction="in" name="wRatio"/>
      <arg type="d" direction="in" name="hRatio"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="GetActiveWindow">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="MoveWindowByTitle">
      <arg type="s" direction="in" name="substring"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="MinimizeByTitle">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="CloseByTitle">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="MoveToWorkspace">
      <arg type="s" direction="in" name="substring"/>
      <arg type="i" direction="in" name="workspace"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="TileBatch">
      <arg type="s" direction="in" name="json"/>
      <arg type="s" direction="out" name="result"/>
    </method>
  </interface>
</node>`;

export default class DjGnomeFocus extends Extension {
    _dbusId = null;

    enable() {
        this._dbusId = Gio.DBus.session.register_object(
            '/org/gnome/Shell/Extensions/DjFocus',
            Gio.DBusNodeInfo.new_for_xml(IFACE_XML).interfaces[0],
            (connection, sender, path, iface, method, params, invocation) => {
                // Wrap every handler so a JS exception returns a useful D-Bus
                // error rather than hanging the caller for 8+ seconds.
                try {
                    if (method === 'FocusApp') {
                        const appId = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(b)', [this._focusApp(appId)]));
                    } else if (method === 'FocusTitle') {
                        const substring = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(b)', [this._focusTitle(substring)]));
                    } else if (method === 'TileWindowByPid') {
                        const [pid, xR, yR, wR, hR] = params.deep_unpack();
                        invocation.return_value(new GLib.Variant('(b)', [this._tileWindowByPid(pid, xR, yR, wR, hR)]));
                    } else if (method === 'TileWindowByTitle') {
                        const [substring, xR, yR, wR, hR] = params.deep_unpack();
                        invocation.return_value(new GLib.Variant('(b)', [this._tileWindowByTitle(substring, xR, yR, wR, hR)]));
                    } else if (method === 'ListWindows') {
                        invocation.return_value(new GLib.Variant('(s)', [this._listWindows()]));
                    } else if (method === 'GetActiveWindow') {
                        invocation.return_value(new GLib.Variant('(s)', [this._getActiveWindow()]));
                    } else if (method === 'MoveWindowByTitle') {
                        const [substring, x, y] = params.deep_unpack();
                        invocation.return_value(new GLib.Variant('(b)', [this._moveWindowByTitle(substring, x, y)]));
                    } else if (method === 'MinimizeByTitle') {
                        const substring = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(b)', [this._minimizeByTitle(substring)]));
                    } else if (method === 'CloseByTitle') {
                        const substring = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(b)', [this._closeByTitle(substring)]));
                    } else if (method === 'MoveToWorkspace') {
                        const [substring, ws] = params.deep_unpack();
                        invocation.return_value(new GLib.Variant('(b)', [this._moveToWorkspace(substring, ws)]));
                    } else if (method === 'TileBatch') {
                        const json = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(s)', [this._tileBatch(json)]));
                    } else {
                        invocation.return_error_literal(
                            Gio.DBusError, Gio.DBusError.UNKNOWN_METHOD,
                            `Unknown method: ${method}`);
                    }
                } catch (e) {
                    console.error(`DjFocus.${method} threw:`, e);
                    invocation.return_error_literal(
                        Gio.DBusError, Gio.DBusError.FAILED,
                        `${method}: ${e.message || e}`);
                }
            },
            null,
            null,
        );
    }

    disable() {
        if (this._dbusId) {
            Gio.DBus.session.unregister_object(this._dbusId);
            this._dbusId = null;
        }
    }

    _focusApp(appId) {
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        if (!app)
            return false;
        const windows = app.get_windows();
        if (windows.length === 0)
            return false;
        windows[0].activate(global.get_current_time());
        return true;
    }

    _findWindow(predicate) {
        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;
            if (predicate(win))
                return win;
        }
        return null;
    }

    _findByTitle(substring) {
        const lc = substring.toLowerCase();
        return this._findWindow(w => (w.get_title() || '').toLowerCase().includes(lc));
    }

    _focusTitle(substring) {
        const win = this._findByTitle(substring);
        if (!win)
            return false;
        win.activate(global.get_current_time());
        return true;
    }

    _tileTo(target, xRatio, yRatio, wRatio, hRatio) {
        const monitorIdx = global.display.get_primary_monitor();
        const ws = global.workspace_manager.get_active_workspace();
        const workArea = ws.get_work_area_for_monitor(monitorIdx);

        const x = Math.round(workArea.x + xRatio * workArea.width);
        const y = Math.round(workArea.y + yRatio * workArea.height);
        const w = Math.max(1, Math.round(wRatio * workArea.width));
        const h = Math.max(1, Math.round(hRatio * workArea.height));

        // Unmaximize unconditionally — no-op if not maximized. Avoids API drift
        // on get_maximized()/maximized_horizontally between Meta versions.
        try {
            target.unmaximize(Meta.MaximizeFlags.BOTH);
        } catch (_e) {
            // some Meta builds throw if already non-maximized; safe to ignore
        }
        target.move_resize_frame(true, x, y, w, h);
        return true;
    }

    _tileWindowByPid(pid, xRatio, yRatio, wRatio, hRatio) {
        const target = this._findWindow(w => w.get_pid() === pid);
        if (!target)
            return false;
        return this._tileTo(target, xRatio, yRatio, wRatio, hRatio);
    }

    _tileWindowByTitle(substring, xRatio, yRatio, wRatio, hRatio) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        return this._tileTo(target, xRatio, yRatio, wRatio, hRatio);
    }

    _listWindows() {
        const out = [];
        for (const actor of global.get_window_actors()) {
            const w = actor.meta_window;
            out.push({
                wm_class: w.get_wm_class() || '',
                title: w.get_title() || '',
                pid: w.get_pid(),
                id: w.get_id(),
            });
        }
        return JSON.stringify(out);
    }

    _getActiveWindow() {
        const win = global.display.get_focus_window();
        if (!win)
            return JSON.stringify(null);
        const rect = win.get_frame_rect();
        return JSON.stringify({
            wm_class: win.get_wm_class() || '',
            title: win.get_title() || '',
            pid: win.get_pid(),
            id: win.get_id(),
            x: rect.x, y: rect.y, w: rect.width, h: rect.height,
            monitor: win.get_monitor(),
        });
    }

    _moveWindowByTitle(substring, x, y) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        try {
            target.unmaximize(Meta.MaximizeFlags.BOTH);
        } catch (_e) {
            // ignore
        }
        const rect = target.get_frame_rect();
        target.move_resize_frame(true, x, y, rect.width, rect.height);
        return true;
    }

    _minimizeByTitle(substring) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        target.minimize();
        return true;
    }

    _closeByTitle(substring) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        target.delete(global.get_current_time());
        return true;
    }

    _moveToWorkspace(substring, wsIndex) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        const wsCount = global.workspace_manager.get_n_workspaces();
        if (wsIndex < 0 || wsIndex >= wsCount)
            return false;
        target.change_workspace_by_index(wsIndex, false);
        return true;
    }

    // Atomic batch tile. Input: JSON array of {title, x, y, w, h} (ratios).
    // Output: JSON {placed: N, failed: [titles]}. One D-Bus round trip
    // instead of N — useful for the 8-window grid which previously made
    // 8 sequential calls with mid-loop races.
    _tileBatch(json) {
        let items;
        try {
            items = JSON.parse(json);
        } catch (e) {
            return JSON.stringify({error: `bad json: ${e.message}`, placed: 0, failed: []});
        }
        if (!Array.isArray(items))
            return JSON.stringify({error: 'expected array', placed: 0, failed: []});

        const failed = [];
        let placed = 0;
        for (const item of items) {
            const {title, x, y, w, h} = item;
            const target = this._findByTitle(title);
            if (!target) {
                failed.push(title);
                continue;
            }
            try {
                this._tileTo(target, x, y, w, h);
                placed += 1;
            } catch (e) {
                failed.push(title);
            }
        }
        return JSON.stringify({placed, failed});
    }
}
