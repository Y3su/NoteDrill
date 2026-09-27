const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 17)) {
  console.error(`NoteDrill needs Node.js >=22.17.0 (current: ${process.versions.node}). Install Node.js 24 LTS and reopen the terminal.`);
  process.exit(1);
}
