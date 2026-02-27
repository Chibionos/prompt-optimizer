/**
 * Simple structured logger for CLI output.
 */
export const log = {
  info(msg: string) {
    console.log(`[INFO]  ${msg}`);
  },
  success(msg: string) {
    console.log(`[OK]    ${msg}`);
  },
  warn(msg: string) {
    console.warn(`[WARN]  ${msg}`);
  },
  error(msg: string) {
    console.error(`[ERROR] ${msg}`);
  },
  progress(current: number, total: number, label: string) {
    const pct = Math.round((current / total) * 100);
    const bar = buildProgressBar(pct);
    process.stdout.write(`\r${bar} ${pct}% (${current}/${total}) ${label}`);
    if (current === total) process.stdout.write('\n');
  },
  table(data: Record<string, unknown>[]) {
    console.table(data);
  },
};

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`;
}
