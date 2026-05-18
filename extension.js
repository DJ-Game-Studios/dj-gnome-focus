/**
 * DJ GNOME Focus — D-Bus window-control service for Wayland.
 *
 * Methods on org.gnome.Shell.Extensions.DjFocus:
 *   FocusApp(appId: string) → boolean
 *   FocusTitle(substring: string) → boolean
 *   TileWindowByPid(pid: int32, xRatio: double, yRatio: double,
 *                   wRatio: double, hRatio: double) → boolean
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
  </interface>
</node>`;

export default class DjGnomeFocus extends Extension {
    _dbusId = null;

    enable() {
        this._dbusId = Gio.DBus.session.register_object(
            '/org/gnome/Shell/Extensions/DjFocus',
            Gio.DBusNodeInfo.new_for_xml(IFACE_XML).interfaces[0],
            (connection, sender, path, iface, method, params, invocation) => {
                if (method === 'FocusApp') {
                    const appId = params.deep_unpack()[0];
                    const result = this._focusApp(appId);
                    invocation.return_value(new GLib.Variant('(b)', [result]));
                } else if (method === 'FocusTitle') {
                    const substring = params.deep_unpack()[0];
                    const result = this._focusTitle(substring);
                    invocation.return_value(new GLib.Variant('(b)', [result]));
                } else if (method === 'TileWindowByPid') {
                    const [pid, xR, yR, wR, hR] = params.deep_unpack();
                    const result = this._tileWindowByPid(pid, xR, yR, wR, hR);
                    invocation.return_value(new GLib.Variant('(b)', [result]));
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
        const tracker = Shell.WindowTracker.get_default();
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        if (!app)
            return false;

        const windows = app.get_windows();
        if (windows.length === 0)
            return false;

        // Focus the most recently used window
        const win = windows[0];
        const time = global.get_current_time();
        win.activate(time);
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

    _focusTitle(substring) {
        const lc = substring.toLowerCase();
        const win = this._findWindow(w => (w.get_title() || '').toLowerCase().includes(lc));
        if (!win)
            return false;
        win.activate(global.get_current_time());
        return true;
    }

    // Positions a window owned by `pid` to the rect described by 0..1 ratios
    // of the primary monitor's work area. Returns false if no matching window.
    _tileWindowByPid(pid, xRatio, yRatio, wRatio, hRatio) {
        const target = this._findWindow(w => w.get_pid() === pid);
        if (!target)
            return false;

        const monitorIdx = global.display.get_primary_monitor();
        const ws = global.workspace_manager.get_active_workspace();
        const workArea = ws.get_work_area_for_monitor(monitorIdx);

        const x = Math.round(workArea.x + xRatio * workArea.width);
        const y = Math.round(workArea.y + yRatio * workArea.height);
        const w = Math.max(1, Math.round(wRatio * workArea.width));
        const h = Math.max(1, Math.round(hRatio * workArea.height));

        if (target.get_maximized())
            target.unmaximize(Meta.MaximizeFlags.BOTH);
        target.move_resize_frame(true, x, y, w, h);
        return true;
    }
}
