/**
 * DJ GNOME Focus — D-Bus window focus service for Wayland.
 *
 * Exposes a single D-Bus method:
 *   org.gnome.Shell.Extensions.DjFocus.FocusApp(appId: string) → boolean
 *
 * Usage from CLI:
 *   gdbus call --session \
 *     --dest org.gnome.Shell \
 *     --object-path /org/gnome/Shell/Extensions/DjFocus \
 *     --method org.gnome.Shell.Extensions.DjFocus.FocusApp \
 *     "code_code.desktop"
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

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

    _focusTitle(substring) {
        const lc = substring.toLowerCase();
        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;
            const title = (win.get_title() || '').toLowerCase();
            if (title.includes(lc)) {
                win.activate(global.get_current_time());
                return true;
            }
        }
        return false;
    }
}
