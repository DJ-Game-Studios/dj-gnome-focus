// test_assertions.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const projectDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(projectDir, '..');

function runAll() {
    testMetadata();
    testBareDjSpawn();
    testSharedModules();
    testDisableSignals();
    testFocusByStableIdSurface();
    testPointerTwoPhaseSurface();
    testKeyTwoPhaseSurface();
    console.log("All assertions passed!");
}

function testKeyTwoPhaseSurface() {
    const content = fs.readFileSync(path.join(projectDir, 'extension.js'), 'utf8');
    for (const method of ['KeyStatus', 'PlanKeyPress', 'CommitKeyPress']) {
        assert(content.includes(`<method name="${method}">`), `${method} must be exported over D-Bus`);
        assert(content.includes(`method === '${method}'`), `${method} must have a D-Bus dispatcher`);
    }
    assert(content.includes('<arg type="s" direction="in" name="requestJson"/>'),
        'CommitKeyPress must accept request JSON, not a bare plan id');
    assert(content.includes('create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE)'),
        'commit must create a compositor virtual keyboard');
    assert(content.includes('Clutter.KeyState.PRESSED') && content.includes('Clutter.KeyState.RELEASED'),
        'commit must press and release through the virtual keyboard');
    assert(content.includes('Clutter[`KEY_${name}`]'),
        'keysyms must resolve by name so the bridge stays layout-independent');
    assert(!content.includes('notify_key('),
        'the key bridge must use keyvals, never raw layout-dependent keycodes');
    for (const refusal of ['unknown_or_consumed_plan', 'expired_plan', 'target_identity_changed',
        'target_not_active', 'target_changed_before_input', 'unknown_keysym',
        'modifier_not_allowed']) {
        assert(content.includes(refusal), `key commit must be able to refuse with ${refusal}`);
    }
    assert(content.includes('if (!request.allow_unfocused) {'),
        'an inactive target must be refused unless the caller allowed it');
    assert(content.indexOf('this._keyPlan = null;\n\n        const request = this._parseKeyCommitRequest') > -1,
        'the plan slot must be consumed before the commit request is even parsed');
    assert(content.indexOf('this._keyPlan = null;\n\n        const request = this._parseKeyCommitRequest') <
        content.indexOf('notify_keyval('), 'the plan must be consumed before injection');
    assert(content.includes('[...heldModifiers].reverse()'),
        'modifiers must be released in reverse order');
    assert(content.includes('} finally {'), 'a partial press must always be unwound');
    assert(content.includes('key_release_failed'),
        'commit must report a failed release and discard the uncertain device');
    const keyStatusBlock = content.slice(content.indexOf('_keyStatus() {'),
        content.indexOf('_parseKeyPressRequest'));
    assert(!keyStatusBlock.includes('plan_id:'), 'status must not disclose the commit capability');
    assert(!/\n\s{12}session:/.test(keyStatusBlock),
        'KeyStatus must not use a top-level `session` key — the MCP caller merges its own there');
    console.log('  ✔ two-phase exact-window key surface present');
}

function testPointerTwoPhaseSurface() {
    const content = fs.readFileSync(path.join(projectDir, 'extension.js'), 'utf8');
    for (const method of ['PointerStatus', 'PlanPointerClick', 'CommitPointerClick']) {
        assert(content.includes(`<method name="${method}">`), `${method} must be exported over D-Bus`);
        assert(content.includes(`method === '${method}'`), `${method} must have a D-Bus dispatcher`);
    }
    assert(content.includes("import Clutter from 'gi://Clutter'"), 'pointer injection must use compositor Clutter');
    assert(content.includes('create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE)'),
        'commit must create a compositor virtual pointer');
    assert(content.includes('notify_absolute_motion'), 'commit must move through the virtual pointer');
    assert(content.includes('notify_button'), 'commit must press and release through the virtual pointer');
    assert(content.includes('Clutter.BUTTON_PRIMARY'), 'the initial surface must be left-click only');
    // The key bridge is a separate, separately gated surface. These two
    // assertions were global until it landed; they are now scoped to the
    // pointer commit path, which must still never inject keyboard input.
    const pointerCommit = content.slice(content.indexOf('_commitPointerClick(planId) {'),
        content.indexOf('_clearExpiredKeyPlan('));
    assert(pointerCommit.length > 0, 'pointer commit block must be locatable');
    assert(!pointerCommit.includes('notify_key('), 'the pointer bridge must not inject keyboard input');
    assert(!pointerCommit.includes('notify_keyval('), 'the pointer bridge must not inject key symbols');
    assert(content.includes("throw new Error('target_geometry_changed')"),
        'commit must reject geometry drift');
    assert(content.includes("throw new Error('target_not_active')"),
        'commit must require the exact target to remain active');
    assert(content.includes("throw new Error('human_pointer_moved')"),
        'commit must refuse after human pointer movement');
    assert(content.includes("throw new Error('target_changed_before_input')"),
        'commit must recheck the exact target immediately before input');
    assert(content.includes('} finally {\n            if (pressed) {'),
        'commit must always attempt button release after a successful press');
    assert(content.includes('button_release_failed'),
        'commit must report a failed release and discard the uncertain device');
    assert(content.indexOf('this._pointerPlan = null;\n        if (!plan || plan.id !== planId)') <
        content.indexOf('notify_absolute_motion'), 'the plan must be consumed before injection');
    const statusBlock = content.slice(content.indexOf('_pointerStatus()'), content.indexOf('_parsePointerClickRequest'));
    assert(!statusBlock.includes('plan_id:'), 'status must not disclose the commit capability');
    console.log('  ✔ two-phase exact-window pointer surface present');
}

function testFocusByStableIdSurface() {
    const content = fs.readFileSync(path.join(projectDir, 'extension.js'), 'utf8');
    assert(content.includes('<method name="FocusId">'), 'D-Bus XML must expose FocusId');
    assert(content.includes('<arg type="u" direction="in" name="windowId"/>'),
        'FocusId must accept a uint32 Mutter window ID');
    assert(content.includes("method === 'FocusId'"), 'D-Bus dispatch must handle FocusId');
    assert(content.includes('w.get_id() === windowId'), 'FocusId must match the stable Mutter ID');
    assert(content.includes('Main.activateWindow(windows[0])'),
        'FocusApp must use the Shell workspace-aware activation helper');
    const focusTitle = content.slice(content.indexOf('_focusTitle(substring) {'),
        content.indexOf('_focusId(windowId) {'));
    const focusId = content.slice(content.indexOf('_focusId(windowId) {'),
        content.indexOf('_tileTo(target'));
    assert(focusTitle.includes('Main.activateWindow(win)'),
        'FocusTitle must switch to an off-workspace target before activation');
    assert(focusId.includes('Main.activateWindow(win)'),
        'FocusId must switch to an off-workspace target before activation');
    assert(!focusTitle.includes('win.activate(') && !focusId.includes('win.activate('),
        'focus methods must not bypass Shell workspace activation');
    console.log('  ✔ stable window-ID focus surface present');
}

function testMetadata() {
    const metaPath = path.join(projectDir, 'metadata.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    
    assert(meta.uuid, 'metadata.json missing uuid');
    assert(meta.uuid.includes('@djmsqrvve'), 'uuid must end with @djmsqrvve');
    
    assert(meta['shell-version'], 'metadata.json missing shell-version');
    assert(Array.isArray(meta['shell-version']), 'shell-version must be an array');
    
    assert(typeof meta.version === 'number', 'version must be an integer');
    
    console.log("  ✔ metadata.json schema valid");
}

function testBareDjSpawn() {
    // Recursively check JS files for bare `dj ` spawn.
    function checkDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory() && e.name !== 'tests' && e.name !== '.git') {
                checkDir(path.join(dir, e.name));
            } else if (e.isFile() && e.name.endsWith('.js')) {
                const content = fs.readFileSync(path.join(dir, e.name), 'utf8');
                if (content.match(/GLib\.spawn_command_line_async\(.*['"\`]dj /)) {
                    assert.fail(`Found bare 'dj ' spawn in ${e.name}. Use \${HOME}/bin/dj`);
                }
            }
        }
    }
    checkDir(projectDir);
    console.log("  ✔ no bare `dj ` spawns found");
}

function testSharedModules() {
    const shared = ['dj-theming.js', 'dj-markup.js', 'dj-endpoints.js'];
    for (const file of shared) {
        // Strip the 'dj-' prefix for the extension-local filename
        const localFile = file.replace('dj-', '');
        const rootPath = path.join(rootDir, file);
        const localPath = path.join(projectDir, localFile);
        
        if (fs.existsSync(localPath) && fs.existsSync(rootPath)) {
            const rootContent = fs.readFileSync(rootPath, 'utf8');
            const localContent = fs.readFileSync(localPath, 'utf8');
            assert.strictEqual(localContent, rootContent, `${localFile} is out of sync with root ${file}`);
        }
    }
    console.log("  ✔ shared modules are byte-identical to root SSOT");
}

function testDisableSignals() {
    // Check extension.js or indicator.js for _signals tracking and disconnect
    let hasSignals = false;
    let hasDisconnect = false;
    let hasClearSection = false;

    for (const file of ['extension.js', 'indicator.js', 'warper.js', 'focus.js']) {
        const fp = path.join(projectDir, file);
        if (fs.existsSync(fp)) {
            const content = fs.readFileSync(fp, 'utf8');
            if (content.includes('this._signals')) hasSignals = true;
            if (content.includes('disconnect(')) hasDisconnect = true;
            if (content.includes('_clearSection(')) hasClearSection = true;
        }
    }
    
    // For simple extensions like focus and screenshot, they might not have _signals
    const isSimple = projectDir.endsWith('dj-gnome-focus') || projectDir.endsWith('dj-screenshot');
    
    if (!isSimple) {
        assert(hasSignals && hasDisconnect, 'Extension must track _signals and call disconnect() in disable/destroy');
    }
    console.log("  ✔ disable() signal cleanup verified");
}

runAll();
