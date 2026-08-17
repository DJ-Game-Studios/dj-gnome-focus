// test_key_injection.mjs — behavioral tests for the two-phase key surface.
//
// Why this exists: on Wayland this extension cannot be reloaded in-session
// (see ../../reload.sh), so the key bridge may sit unverified between logins.
// String assertions in test_assertions.js prove the surface is *present*; this
// file proves it *behaves*. It loads extension.js with the shell imports
// stripped and Clutter/Mutter replaced by recording stubs, then drives the
// plan/commit state machine directly.
//
// It caught two real defects on first run:
//   1. a modifier recorded as held only AFTER notify_keyval returned, so a
//      throwing modifier press left Ctrl stuck down on the live desktop;
//   2. a virtual device retained after a failed press, whose key state was
//      unknowable.
// Both are asserted below. Do not weaken them.

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import {fileURLToPath, pathToFileURL} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'extension.js');

const EVENTS = [];
const STATE = {
    windows: [], focusId: null, seatOk: true, deviceOk: true, failOn: null,
};
let monotonic = 1000000;
const advanceUs = us => { monotonic += us; };

// Clutter stub. The Proxy makes an unknown KEY_* resolve to `undefined`,
// exactly as the real GJS namespace does — that is the case _resolveKeysym
// must refuse. Keysym values are the real ones, read from the Clutter-18
// typelib GNOME Shell 50 actually loads.
const ClutterStub = new Proxy({
    KeyState: {PRESSED: 1, RELEASED: 0},
    ButtonState: {PRESSED: 1, RELEASED: 0},
    BUTTON_PRIMARY: 1,
    InputDeviceType: {POINTER_DEVICE: 0, KEYBOARD_DEVICE: 1},
    KEY_F9: 65478, KEY_Escape: 65307,
    KEY_Control_L: 65507, KEY_Alt_L: 65513, KEY_Shift_L: 65505, KEY_Super_L: 65515,
    get_default_backend: () => ({
        get_default_seat: () => ({
            create_virtual_device: STATE.seatOk ? () => {
                if (!STATE.deviceOk)
                    return null;
                return {
                    notify_keyval(timeUs, keyval, state) {
                        const isKey = keyval === 65478 || keyval === 65307;
                        const kind = state === 1
                            ? (isKey ? 'keypress' : 'modpress')
                            : (isKey ? 'keyrelease' : 'modrelease');
                        const failed = STATE.failOn === kind;
                        // Record the ATTEMPT even when the device rejects it:
                        // the extension must attempt a release for everything
                        // it pressed; it cannot force a refusing device to
                        // deliver.
                        EVENTS.push({timeUs, keyval, state, failed});
                        if (failed)
                            throw new Error('device rejected the event');
                    },
                    notify_absolute_motion() {}, notify_button() {},
                };
            } : undefined,
        }),
    }),
}, {get: (target, prop) => (prop in target ? target[prop] : undefined)});

const shim = `
const Clutter = globalThis.__CLUTTER__;
const GLib = globalThis.__GLIB__;
const Gio = globalThis.__GIO__;
const Main = {activateWindow: () => {}};
const Shell = {AppSystem: {get_default: () => ({lookup_app: () => null})}};
const Meta = {};
class Extension {}
`;

globalThis.__CLUTTER__ = ClutterStub;
globalThis.__GLIB__ = {
    get_monotonic_time: () => monotonic,
    uuid_string_random: () => `plan-${monotonic}-${Math.random().toString(16).slice(2)}`,
    Variant: class {},
};
globalThis.__GIO__ = {
    DBus: {session: {register_object: () => 1, unregister_object: () => {}}},
    DBusNodeInfo: {new_for_xml: () => ({interfaces: [{}]})},
    DBusError: {},
};
globalThis.global = {
    get_pointer: () => [100, 200],
    get_window_actors: () => STATE.windows.map(w => ({meta_window: w})),
    display: {
        get_focus_window: () =>
            STATE.windows.find(w => w.get_id() === STATE.focusId) ?? null,
    },
};

const source = fs.readFileSync(SRC, 'utf8').replace(/^import .*$/gm, '');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'djfocus-')), 'ext.mjs');
fs.writeFileSync(tmp, shim + source);
const DjGnomeFocus = (await import(pathToFileURL(tmp).href)).default;

const mkWindow = (id, title, wmClass, pid = 4242) => ({
    get_id: () => id, get_title: () => title, get_wm_class: () => wmClass,
    get_pid: () => pid, get_frame_rect: () => ({x: 0, y: 0, width: 1920, height: 1080}),
});
const WOW_ID = 1944001617;
const WOW = mkWindow(WOW_ID, 'World of Warcraft', 'wowclassic.exe');

function fresh() {
    const ext = new DjGnomeFocus();
    ext._keyPlan = null;
    ext._virtualKeyboard = null;
    STATE.windows = [WOW];
    STATE.focusId = WOW_ID;
    STATE.seatOk = true;
    STATE.deviceOk = true;
    STATE.failOn = null;
    EVENTS.length = 0;
    return ext;
}

// The exact request shape the desktop-input MCP sends (tools/input.py).
const planReq = (over = {}) => JSON.stringify({
    schema_version: 1, window_id: WOW_ID,
    expected_title: 'World of Warcraft', expected_wm_class: 'wowclassic.exe',
    keyval: 'F9', modifiers: ['ctrl'], intent: 'wow:reload-flush', ttl_ms: 10000,
    ...over,
});
const commitReq = (planId, allowUnfocused = false) =>
    JSON.stringify({allow_unfocused: allowUnfocused, plan_id: planId});

function refuses(fn, needle, label) {
    try {
        fn();
    } catch (e) {
        assert(String(e.message).includes(needle),
            `${label}: expected refusal "${needle}", got "${e.message}"`);
        assert.strictEqual(EVENTS.length, 0, `${label}: a refusal must send NO input`);
        return;
    }
    assert.fail(`${label}: expected a refusal containing "${needle}"`);
}

function testHappyPath() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq()));
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(plan.state, 'planned');
    assert.strictEqual(plan.side_effect, false);
    assert.strictEqual(plan.committable, true);
    assert.strictEqual(plan.key.keyval, 65478);
    assert.deepStrictEqual(plan.key.modifiers, ['ctrl']);
    assert.strictEqual(EVENTS.length, 0, 'planning must send no input');

    const res = JSON.parse(ext._commitKeyPress(commitReq(plan.plan_id)));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.side_effect, true);
    assert.deepStrictEqual(EVENTS.map(e => [e.keyval, e.state]),
        [[65507, 1], [65478, 1], [65478, 0], [65507, 0]],
        'order: modifiers down, key down, key up, modifiers up reversed');
    const times = EVENTS.map(e => e.timeUs);
    assert.deepStrictEqual(times, [...times].sort((a, b) => a - b),
        'event timestamps must strictly increase');
    assert.strictEqual(new Set(times).size, times.length, 'timestamps must be distinct');
    console.log('  ✔ plan sends no input; commit presses in the correct order');
}

function testReverseRelease() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq({modifiers: ['alt', 'ctrl', 'shift']})));
    ext._commitKeyPress(commitReq(plan.plan_id));
    assert.deepStrictEqual(EVENTS.map(e => [e.keyval, e.state]), [
        [65513, 1], [65507, 1], [65505, 1],
        [65478, 1], [65478, 0],
        [65505, 0], [65507, 0], [65513, 0],
    ], 'modifiers must release in exact reverse order');
    console.log('  ✔ modifiers release in reverse order');
}

function testPlanIsSingleUse() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq()));
    ext._commitKeyPress(commitReq(plan.plan_id));
    EVENTS.length = 0;
    refuses(() => ext._commitKeyPress(commitReq(plan.plan_id)),
        'unknown_or_consumed_plan', 'replaying a consumed plan');

    // A malformed commit must also burn the slot — the plan is cleared before
    // the request is even parsed, so no refusal path leaves a replayable plan.
    const ext2 = fresh();
    const plan2 = JSON.parse(ext2._planKeyPress(planReq()));
    refuses(() => ext2._commitKeyPress('{not json'), 'invalid_request_json', 'malformed commit');
    refuses(() => ext2._commitKeyPress(commitReq(plan2.plan_id)),
        'unknown_or_consumed_plan', 'plan surviving a malformed commit');
    console.log('  ✔ a plan is single-use, even when commit validation throws');
}

function testExpiry() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq({ttl_ms: 1000})));
    advanceUs(1000 * 1000 + 1);
    refuses(() => ext._commitKeyPress(commitReq(plan.plan_id)), 'expired_plan', 'expired plan');
    console.log('  ✔ expired plans are refused');
}

function testIdentityRebinding() {
    for (const [label, windows, needle] of [
        ['title', [mkWindow(WOW_ID, 'Battle.net', 'wowclassic.exe')], 'target_identity_changed'],
        ['wm_class', [mkWindow(WOW_ID, 'World of Warcraft', 'evil.exe')], 'target_identity_changed'],
        ['pid', [mkWindow(WOW_ID, 'World of Warcraft', 'wowclassic.exe', 999)], 'target_identity_changed'],
        ['closed', [], 'target_window_not_found'],
    ]) {
        const ext = fresh();
        const plan = JSON.parse(ext._planKeyPress(planReq()));
        STATE.windows = windows;
        STATE.focusId = WOW_ID;
        refuses(() => ext._commitKeyPress(commitReq(plan.plan_id)), needle,
            `identity change: ${label}`);
    }
    console.log('  ✔ commit refuses when window identity changed after planning');
}

function testFocusGate() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq()));
    STATE.focusId = null;
    refuses(() => ext._commitKeyPress(commitReq(plan.plan_id, false)),
        'target_not_active', 'unfocused commit without authorization');

    const ext2 = fresh();
    STATE.focusId = null;
    const plan2 = JSON.parse(ext2._planKeyPress(planReq()));
    assert.strictEqual(plan2.committable, false, 'plan must report committable=false');
    const res = JSON.parse(ext2._commitKeyPress(commitReq(plan2.plan_id, true)));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.checks.allow_unfocused, true);
    assert.strictEqual(EVENTS.length, 4, 'an armed session may press while unfocused');
    console.log('  ✔ inactive target refused unless allow_unfocused was granted');
}

function testCommitCannotRedirect() {
    // Key, modifiers, window and intent are bound at PLAN time. Nothing in the
    // commit request may change them; unknown commit fields are refused.
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq({keyval: 'Escape', modifiers: []})));
    refuses(() => ext._commitKeyPress(JSON.stringify(
        {plan_id: plan.plan_id, allow_unfocused: false, keyval: 'F9'})),
    'unknown fields', 'commit carrying a keyval');

    const ext2 = fresh();
    const plan2 = JSON.parse(ext2._planKeyPress(planReq({keyval: 'Escape', modifiers: []})));
    ext2._commitKeyPress(commitReq(plan2.plan_id));
    assert.deepStrictEqual(EVENTS.map(e => e.keyval), [65307, 65307],
        'the key pressed must be the one bound at plan time');
    console.log('  ✔ commit cannot redirect the key, modifiers, or window');
}

function testRequestValidation() {
    const ext = fresh();
    const cases = [
        [{keyval: 'NoSuchKey'}, 'unknown_keysym', 'unresolvable keysym name'],
        [{keyval: 65478}, 'invalid_keyval_name', 'numeric keyval'],
        [{keyval: 'a b'}, 'invalid_keyval_name', 'keyval charset'],
        [{keyval: 'toString'}, 'unknown_keysym', 'non-keysym namespace property'],
        [{modifiers: ['hyper']}, 'modifier_not_allowed', 'modifier outside the allowlist'],
        [{modifiers: ['ctrl', 'ctrl']}, 'duplicate_modifier', 'duplicate modifier'],
        [{modifiers: 'ctrl'}, 'invalid_modifiers', 'non-array modifiers'],
        [{ttl_ms: 999}, 'invalid_ttl_ms', 'ttl below the pointer minimum'],
        [{ttl_ms: 30001}, 'invalid_ttl_ms', 'ttl above the pointer maximum'],
        [{schema_version: 2}, 'unsupported_schema_version', 'schema version'],
        [{expected_title: 'Wrong'}, 'target_title_mismatch', 'title mismatch'],
        [{expected_wm_class: 'x'}, 'target_wm_class_mismatch', 'wm_class mismatch'],
        [{window_id: 5}, 'target_window_not_found', 'unknown window id'],
        [{policy: 'wow'}, 'unknown fields', 'unexpected request field'],
    ];
    for (const [over, needle, label] of cases)
        refuses(() => ext._planKeyPress(planReq(over)), needle, label);

    const plan = JSON.parse(ext._planKeyPress(JSON.stringify({
        schema_version: 1, window_id: WOW_ID, expected_title: 'World of Warcraft',
        expected_wm_class: 'wowclassic.exe', keyval: 'F9', intent: 'wow:x',
    })));
    assert.strictEqual(plan.expires_in_ms, 10000, 'ttl_ms must default to 10000');
    assert.deepStrictEqual(plan.key.modifiers, [], 'modifiers must default to []');
    console.log(`  ✔ plan request validation (${cases.length} refusals + defaults)`);
}

function testNothingIsLeftHeldDown() {
    // The regression that matters most: a failure anywhere in the sequence must
    // never leave a modifier or key held on the user's live desktop.
    for (const failOn of ['modpress', 'keypress', 'keyrelease', 'modrelease']) {
        const ext = fresh();
        STATE.failOn = failOn;
        const plan = JSON.parse(ext._planKeyPress(planReq({modifiers: ['ctrl', 'shift']})));
        assert.throws(() => ext._commitKeyPress(commitReq(plan.plan_id)), undefined,
            `${failOn}: the failure must surface to the caller`);
        const lastState = new Map();
        for (const e of EVENTS)
            lastState.set(e.keyval, e.state);
        const held = [...lastState.entries()].filter(([, s]) => s === 1).map(([k]) => k);
        assert.deepStrictEqual(held, [],
            `${failOn}: no release was attempted for keyval(s) ${held.join(',')}`);
        assert.strictEqual(ext._virtualKeyboard, null,
            `${failOn}: a device that threw must be discarded, not reused`);
    }
    console.log('  ✔ injection failure never leaves a key or modifier held down');
}

function testKeyStatus() {
    const ext = fresh();
    let status = JSON.parse(ext._keyStatus());
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.pending_plan, null);
    assert.deepStrictEqual(status.constraints.plan_ttl_ms, {min: 1000, max: 30000},
        'key TTL bounds must match the pointer bounds');
    // Task 4's dj_key_status merges its own session state in under `session`.
    // A top-level `session` here would be silently clobbered.
    assert(!('session' in status),
        'KeyStatus must not return a top-level `session` key');

    const plan = JSON.parse(ext._planKeyPress(planReq()));
    status = JSON.parse(ext._keyStatus());
    assert(status.pending_plan, 'an outstanding plan must be reported');
    assert.strictEqual(status.pending_plan.intent, 'wow:reload-flush');
    assert(status.pending_plan.expires_in_ms > 0 && status.pending_plan.expires_in_ms <= 10000);
    assert(!JSON.stringify(status).includes(plan.plan_id),
        'status must never disclose the commit capability');

    advanceUs(11000 * 1000);
    assert.strictEqual(JSON.parse(ext._keyStatus()).pending_plan, null,
        'status must sweep an expired plan');
    console.log('  ✔ KeyStatus: no `session` key, no plan-id leak, sweeps expiry');
}

function testCapabilityFailsClosed() {
    const ext = fresh();
    const plan = JSON.parse(ext._planKeyPress(planReq()));
    STATE.seatOk = false;
    refuses(() => ext._commitKeyPress(commitReq(plan.plan_id)),
        'virtual_keyboard_unavailable', 'seat without virtual-device support');

    const ext2 = fresh();
    const plan2 = JSON.parse(ext2._planKeyPress(planReq()));
    STATE.deviceOk = false;
    refuses(() => ext2._commitKeyPress(commitReq(plan2.plan_id)),
        'virtual_keyboard_creation_failed', 'device creation returning null');
    console.log('  ✔ a missing virtual-keyboard capability fails closed');
}

function testPointerSurfaceUnregressed() {
    const ext = fresh();
    const plan = JSON.parse(ext._planPointerClick(JSON.stringify({
        schema_version: 1, window_id: WOW_ID, expected_title: 'World of Warcraft',
        expected_wm_class: 'wowclassic.exe', x_ratio: 0.5, y_ratio: 0.5,
        intent: 'battle.net:x', ttl_ms: 10000,
    })));
    assert.strictEqual(plan.ok, true);
    assert.strictEqual(JSON.parse(ext._pointerStatus()).ok, true);
    console.log('  ✔ the shipped pointer surface still plans and reports');
}

testHappyPath();
testReverseRelease();
testPlanIsSingleUse();
testExpiry();
testIdentityRebinding();
testFocusGate();
testCommitCannotRedirect();
testRequestValidation();
testNothingIsLeftHeldDown();
testKeyStatus();
testCapabilityFailsClosed();
testPointerSurfaceUnregressed();
fs.rmSync(path.dirname(tmp), {recursive: true, force: true});
console.log('All key-injection behavioral assertions passed!');
