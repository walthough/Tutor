const fs = require('node:fs');
const path = require('node:path');

const root = process.env.STUDY_APP_TEST_ROOT;
fs.appendFileSync(
  path.join(root, 'cli-launches.jsonl'),
  JSON.stringify({
    args: process.argv.slice(2),
    subject: process.env.STUDY_APP_SUBJECT,
    notesPath: process.env.STUDY_APP_NOTES_PATH
  }) + '\n'
);
process.stdin.setRawMode(true);
process.stdout.write('\x1b[32mCodex CLI ready\x1b[0m\r\n');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk.toString().replace(/\x1b\[20[01]~/g, '');
  let end;
  while ((end = input.indexOf('\r')) !== -1) {
    const line = input.slice(0, end);
    input = input.slice(end + 1);
    process.stdout.write('CLI received: ' + line + '\r\n');
    if (line === '/exit') process.exit(0);
    if (line === 'write a note') {
      fs.writeFileSync(
        process.env.STUDY_APP_NOTES_PATH,
        '# CLI lesson\n\n## Summary\nPractised Finnish in the CLI.\n\n## Terms & definitions\n- **lepo**: rest\n'
      );
    }
  }
});
