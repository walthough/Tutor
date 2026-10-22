const { build } = require('esbuild');
const path = require('node:path');
const Module = require('node:module');
(async () => {
  const result = await build({ entryPoints: [path.join(__dirname, '../src/chat.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const compiled = new Module(__filename); compiled.filename = __filename; compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, __filename);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.OPENAI_API_KEY;
  let closed = false;
  const connection = new compiled.exports.CodexChatConnection(path.join(process.env.LOCALAPPDATA, 'Programs/OpenAI/Codex/bin/codex.exe'), path.resolve(__dirname, '../..'), env, () => {}, error => { if (!closed) console.error(error.message); });
  try {
    const response = await connection.request('initialize', { clientInfo: { name: 'study_workspace_check', title: 'Study Workspace protocol check', version: '0.1.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
    if (!response || typeof response.userAgent !== 'string') throw new Error('Installed Codex returned an unexpected initialization response.');
    connection.notify('initialized');
    console.log('Installed Codex app-server handshake passed. No threads, inference requests or learner files created.');
  } finally { closed = true; connection.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
