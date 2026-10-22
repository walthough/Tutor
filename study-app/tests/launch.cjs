const path = require('node:path');
const cp = require('node:child_process');
const pty = require('node-pty');

if (!process.env.STUDY_APP_TEST_ROOT || !process.env.STUDY_APP_TEST_NODE)
  throw new Error('The UI test launcher requires an isolated test root and Node executable.');

const node = process.env.STUDY_APP_TEST_NODE;
const spawn = cp.spawn;
cp.spawn = (file, args, options) =>
  /codex\.exe$/i.test(file) && args.includes('app-server')
    ? spawn(node, [path.join(__dirname, 'fake-chat.cjs')], options)
    : spawn(file, args, options);

const spawnTerminal = pty.spawn;
pty.spawn = (file, args, options) =>
  /codex\.exe$/i.test(file)
    ? spawnTerminal(node, [path.join(__dirname, 'fake-terminal.cjs'), ...args], options)
    : spawnTerminal(file, args, options);

require('../dist/main.cjs');
