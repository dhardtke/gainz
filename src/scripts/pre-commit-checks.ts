function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

const input: unknown = await Bun.stdin.json();
const rawCommand = field(field(input, 'tool_input'), 'command');
const command = typeof rawCommand === 'string' ? rawCommand : '';

if (!/\bgit\b[^\n;&|]*\bcommit\b/.test(command)) {
  process.exit(0);
}

const checks = [
  ['bun', 'run', 'fmt:check'],
  ['bun', 'run', 'lint'],
  ['bun', 'run', 'typecheck'],
  ['bun', 'test', '--parallel'],
];

const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const failures: string[] = [];

for (const cmd of checks) {
  const result = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim();
    failures.push(`$ ${cmd.join(' ')} (exit ${result.exitCode})\n${output.split('\n').slice(-40).join('\n')}`);
  }
}

if (failures.length > 0) {
  console.error(`Commit blocked: fix these checks first (bun run fmt formats).\n\n${failures.join('\n\n')}`);
  process.exit(2);
}
