/**
 * DJ GNOME Focus — D-Bus window-control service for Wayland.
 *
 * Methods on org.gnome.Shell.Extensions.DjFocus:
 *   FocusApp(appId: string) → boolean
 *   FocusTitle(substring: string) → boolean
 *   FocusId(windowId: uint32) → boolean
 *   TileWindowByPid(pid: int32, xRatio, yRatio, wRatio, hRatio: double) → boolean
 *   TileWindowByTitle(substring: string, xRatio, yRatio, wRatio, hRatio: double) → boolean
 *   ListWindows() → string  (JSON: [{wm_class, title, pid, id, workspace, monitor}, ...])
 *   GetActiveWindow() → string  (JSON: {wm_class, title, pid, id, x, y, w, h, monitor})
 *   MoveWindowByTitle(substring: string, x, y: int32) → boolean
 *   MinimizeByTitle(substring: string) → boolean
 *   CloseByTitle(substring: string) → boolean
 *   MoveToWorkspace(substring: string, workspace: int32) → boolean
 *   TileBatch(json: string) → string
 *       Input  : [{title, x, y, w, h}, ...]  (ratios 0..1 of primary work area)
 *       Output : {placed: N, failed: [titles...]}
 *   PointerStatus() → string
 *   PlanPointerClick(requestJson: string) → string
 *   CommitPointerClick(planId: string) → string
 *
 * Wayland forbids arbitrary window manipulation from unprivileged clients.
 * Extensions run inside Mutter, so they can.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

const POINTER_SCHEMA_VERSION = 1;
const POINTER_TTL_DEFAULT_MS = 10000;
const POINTER_TTL_MIN_MS = 1000;
const POINTER_TTL_MAX_MS = 30000;
const POINTER_UNCHANGED_TOLERANCE_PX = 2;

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
    <method name="FocusId">
      <arg type="u" direction="in" name="windowId"/>
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
    <method name="GetMonitors">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="TileByTitlePixels">
      <arg type="s" direction="in" name="substring"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="w"/>
      <arg type="i" direction="in" name="h"/>
      <arg type="b" direction="out" name="success"/>
    </method>
    <method name="PointerStatus">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="PlanPointerClick">
      <arg type="s" direction="in" name="requestJson"/>
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="CommitPointerClick">
      <arg type="s" direction="in" name="planId"/>
      <arg type="s" direction="out" name="json"/>
    </method>
  </interface>
</node>`;

export default class DjGnomeFocus extends Extension {
    _dbusId = null;
    _pointerPlan = null;
    _virtualPointer = null;

    enable() {
        this._pointerPlan = null;
        this._virtualPointer = null;
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
                    } else if (method === 'FocusId') {
                        const windowId = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(b)', [this._focusId(windowId)]));
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
                    } else if (method === 'GetMonitors') {
                        invocation.return_value(new GLib.Variant('(s)', [this._getMonitors()]));
                    } else if (method === 'TileByTitlePixels') {
                        const [substring, x, y, w, h] = params.deep_unpack();
                        invocation.return_value(new GLib.Variant('(b)', [this._tileByTitlePixels(substring, x, y, w, h)]));
                    } else if (method === 'PointerStatus') {
                        invocation.return_value(new GLib.Variant('(s)', [this._pointerStatus()]));
                    } else if (method === 'PlanPointerClick') {
                        const requestJson = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(s)', [this._planPointerClick(requestJson)]));
                    } else if (method === 'CommitPointerClick') {
                        const planId = params.deep_unpack()[0];
                        invocation.return_value(new GLib.Variant('(s)', [this._commitPointerClick(planId)]));
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
        this._pointerPlan = null;
        this._virtualPointer = null;
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

    _windowSnapshot(win) {
        const rect = win.get_frame_rect();
        return {
            id: win.get_id(),
            title: win.get_title() || '',
            wm_class: win.get_wm_class() || '',
            pid: win.get_pid(),
            rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
        };
    }

    _pointerPosition() {
        const [x, y] = global.get_pointer();
        return {x, y};
    }

    _clearExpiredPointerPlan(nowUs = GLib.get_monotonic_time()) {
        if (this._pointerPlan && nowUs > this._pointerPlan.expiresUs)
            this._pointerPlan = null;
    }

    _pointerStatus() {
        this._clearExpiredPointerPlan();
        const seat = Clutter.get_default_backend().get_default_seat();
        return JSON.stringify({
            ok: true,
            schema_version: POINTER_SCHEMA_VERSION,
            available: typeof seat.create_virtual_device === 'function',
            pointer: this._pointerPosition(),
            pending_plan: this._pointerPlan ? {
                intent: this._pointerPlan.intent,
                target_window_id: this._pointerPlan.target.id,
                expires_in_ms: Math.max(0, Math.floor(
                    (this._pointerPlan.expiresUs - GLib.get_monotonic_time()) / 1000)),
            } : null,
            constraints: {
                left_click_only: true,
                exact_window_identity: true,
                unchanged_geometry: true,
                target_must_be_active: true,
                pointer_must_be_unchanged: true,
                plan_ttl_ms: {min: POINTER_TTL_MIN_MS, max: POINTER_TTL_MAX_MS},
            },
        });
    }

    _parsePointerClickRequest(requestJson) {
        let request;
        try {
            request = JSON.parse(requestJson);
        } catch (e) {
            throw new Error(`invalid_request_json: ${e.message}`);
        }
        if (!request || typeof request !== 'object' || Array.isArray(request))
            throw new Error('invalid_request: expected an object');

        const allowed = new Set([
            'schema_version', 'window_id', 'expected_title', 'expected_wm_class',
            'x_ratio', 'y_ratio', 'intent', 'ttl_ms',
        ]);
        const unknown = Object.keys(request).filter(key => !allowed.has(key));
        if (unknown.length > 0)
            throw new Error(`invalid_request: unknown fields: ${unknown.join(', ')}`);
        if (request.schema_version !== POINTER_SCHEMA_VERSION)
            throw new Error(`unsupported_schema_version: ${request.schema_version}`);
        if (!Number.isInteger(request.window_id) || request.window_id < 1 || request.window_id > 0xffffffff)
            throw new Error('invalid_window_id');
        if (typeof request.expected_title !== 'string' || request.expected_title.length < 1 || request.expected_title.length > 256)
            throw new Error('invalid_expected_title');
        if (typeof request.expected_wm_class !== 'string' || request.expected_wm_class.length < 1 || request.expected_wm_class.length > 128)
            throw new Error('invalid_expected_wm_class');
        for (const key of ['x_ratio', 'y_ratio']) {
            if (typeof request[key] !== 'number' || !Number.isFinite(request[key]) || request[key] < 0.01 || request[key] > 0.99)
                throw new Error(`invalid_${key}: expected 0.01..0.99`);
        }
        if (typeof request.intent !== 'string' || request.intent.length < 1 || request.intent.length > 120)
            throw new Error('invalid_intent');
        const ttlMs = request.ttl_ms ?? POINTER_TTL_DEFAULT_MS;
        if (!Number.isInteger(ttlMs) || ttlMs < POINTER_TTL_MIN_MS || ttlMs > POINTER_TTL_MAX_MS)
            throw new Error(`invalid_ttl_ms: expected ${POINTER_TTL_MIN_MS}..${POINTER_TTL_MAX_MS}`);
        return {...request, ttl_ms: ttlMs};
    }

    _planPointerClick(requestJson) {
        const request = this._parsePointerClickRequest(requestJson);
        const target = this._findWindow(w => w.get_id() === request.window_id);
        if (!target)
            throw new Error('target_window_not_found');
        const snapshot = this._windowSnapshot(target);
        if (snapshot.title !== request.expected_title)
            throw new Error('target_title_mismatch');
        if (snapshot.wm_class !== request.expected_wm_class)
            throw new Error('target_wm_class_mismatch');
        if (snapshot.rect.w < 1 || snapshot.rect.h < 1)
            throw new Error('target_geometry_invalid');

        const point = {
            x: Math.min(snapshot.rect.x + snapshot.rect.w - 1,
                snapshot.rect.x + Math.floor(request.x_ratio * snapshot.rect.w)),
            y: Math.min(snapshot.rect.y + snapshot.rect.h - 1,
                snapshot.rect.y + Math.floor(request.y_ratio * snapshot.rect.h)),
            x_ratio: request.x_ratio,
            y_ratio: request.y_ratio,
            space: 'desktop-logical-px',
        };
        const active = global.display.get_focus_window();
        const activeId = active ? active.get_id() : null;
        const nowUs = GLib.get_monotonic_time();
        const plan = {
            id: GLib.uuid_string_random(),
            intent: request.intent,
            target: snapshot,
            point,
            pointerBefore: this._pointerPosition(),
            expiresUs: nowUs + request.ttl_ms * 1000,
        };
        this._pointerPlan = plan;
        return JSON.stringify({
            ok: true,
            schema_version: POINTER_SCHEMA_VERSION,
            state: 'planned',
            side_effect: false,
            plan_id: plan.id,
            intent: plan.intent,
            expires_in_ms: request.ttl_ms,
            committable: activeId === snapshot.id,
            target: snapshot,
            point,
            pointer_before: plan.pointerBefore,
            checks: {
                exact_window_id: true,
                exact_title: true,
                exact_wm_class: true,
                target_active: activeId === snapshot.id,
            },
        });
    }

    _commitPointerClick(planId) {
        if (typeof planId !== 'string' || planId.length < 1 || planId.length > 128)
            throw new Error('invalid_plan_id');
        const plan = this._pointerPlan;
        this._pointerPlan = null;
        if (!plan || plan.id !== planId)
            throw new Error('unknown_or_consumed_plan');
        const nowUs = GLib.get_monotonic_time();
        if (nowUs > plan.expiresUs)
            throw new Error('expired_plan');

        const target = this._findWindow(w => w.get_id() === plan.target.id);
        if (!target)
            throw new Error('target_window_not_found');
        const current = this._windowSnapshot(target);
        if (current.title !== plan.target.title || current.wm_class !== plan.target.wm_class)
            throw new Error('target_identity_changed');
        const rectKeys = ['x', 'y', 'w', 'h'];
        if (rectKeys.some(key => current.rect[key] !== plan.target.rect[key]))
            throw new Error('target_geometry_changed');
        const active = global.display.get_focus_window();
        if (!active || active.get_id() !== plan.target.id)
            throw new Error('target_not_active');
        const pointer = this._pointerPosition();
        if (Math.hypot(pointer.x - plan.pointerBefore.x, pointer.y - plan.pointerBefore.y) > POINTER_UNCHANGED_TOLERANCE_PX)
            throw new Error('human_pointer_moved');

        const seat = Clutter.get_default_backend().get_default_seat();
        if (typeof seat.create_virtual_device !== 'function')
            throw new Error('virtual_pointer_unavailable');
        if (!this._virtualPointer)
            this._virtualPointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        if (!this._virtualPointer)
            throw new Error('virtual_pointer_creation_failed');

        // Device creation may allocate or yield inside Mutter. Recheck the
        // mutable desktop state once more immediately before the first event.
        const finalTarget = this._findWindow(w => w.get_id() === plan.target.id);
        if (!finalTarget)
            throw new Error('target_window_not_found');
        const finalSnapshot = this._windowSnapshot(finalTarget);
        if (finalSnapshot.title !== plan.target.title ||
            finalSnapshot.wm_class !== plan.target.wm_class ||
            rectKeys.some(key => finalSnapshot.rect[key] !== plan.target.rect[key]))
            throw new Error('target_changed_before_input');
        const finalActive = global.display.get_focus_window();
        if (!finalActive || finalActive.get_id() !== plan.target.id)
            throw new Error('target_not_active_before_input');
        const finalPointer = this._pointerPosition();
        if (Math.hypot(finalPointer.x - plan.pointerBefore.x,
            finalPointer.y - plan.pointerBefore.y) > POINTER_UNCHANGED_TOLERANCE_PX)
            throw new Error('human_pointer_moved_before_input');

        let pressed = false;
        try {
            this._virtualPointer.notify_absolute_motion(nowUs, plan.point.x, plan.point.y);
            this._virtualPointer.notify_button(
                nowUs + 1000, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pressed = true;
        } finally {
            if (pressed) {
                try {
                    this._virtualPointer.notify_button(
                        nowUs + 2000, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
                } catch (e) {
                    // Drop our reference so a subsequent plan cannot reuse a
                    // device whose button state is uncertain.
                    this._virtualPointer = null;
                    throw new Error(`button_release_failed: ${e.message}`);
                }
            }
        }

        return JSON.stringify({
            ok: true,
            schema_version: POINTER_SCHEMA_VERSION,
            state: 'committed',
            side_effect: true,
            plan_id: plan.id,
            intent: plan.intent,
            target: current,
            point: plan.point,
            checks: {
                exact_window_identity: true,
                unchanged_geometry: true,
                target_active: true,
                pointer_unchanged: true,
            },
        });
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

    _focusId(windowId) {
        const win = this._findWindow(w => w.get_id() === windowId);
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
            target.unmaximize();
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
                // -1 = on-all-workspaces or unset; otherwise the 0-based index
                workspace: w.is_on_all_workspaces() ? -1
                    : (w.get_workspace() ? w.get_workspace().index() : -1),
                monitor: w.get_monitor(),
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
            target.unmaximize();
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

    // Mutter monitor geometry — full set, primary index, work area.
    // Use for tile math against monitors other than the primary, or to know
    // which monitor a TV/secondary is currently at.
    _getMonitors() {
        const display = global.display;
        const primaryIdx = display.get_primary_monitor();
        const n = display.get_n_monitors();
        const ws = global.workspace_manager.get_active_workspace();
        const monitors = [];
        for (let i = 0; i < n; i++) {
            const rect = display.get_monitor_geometry(i);
            const workArea = ws.get_work_area_for_monitor(i);
            monitors.push({
                index: i,
                primary: i === primaryIdx,
                geometry: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
                work_area: {x: workArea.x, y: workArea.y, w: workArea.width, h: workArea.height},
                scale: display.get_monitor_scale(i),
            });
        }
        return JSON.stringify({primary: primaryIdx, count: n, monitors});
    }

    // Absolute-pixel placement. Bypasses the primary-work-area math of _tileTo —
    // caller specifies exact pixels. Useful when targeting non-primary monitors
    // or when ratios would round inconveniently.
    _tileByTitlePixels(substring, x, y, w, h) {
        const target = this._findByTitle(substring);
        if (!target)
            return false;
        try {
            target.unmaximize();
        } catch (_e) {
            // ignore
        }
        target.move_resize_frame(true, x, y, Math.max(1, w), Math.max(1, h));
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
