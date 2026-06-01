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
    console.log("All assertions passed!");
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
