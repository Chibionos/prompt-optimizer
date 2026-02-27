import chalk from 'chalk';

// ── Shared rendering helpers used across all TUI screens ───────────

export function banner() {
  console.log('');
  console.log(chalk.bold.cyan('  ╔═══════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('  ║') + chalk.bold.white('      Prompt Optimizer — Empirical Rule Discovery  ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('  ╚═══════════════════════════════════════════════════╝'));
  console.log('');
}

export function sectionHeader(title: string) {
  console.log('');
  console.log(chalk.bold.yellow(`  ── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`));
  console.log('');
}

export function keyValue(key: string, value: string | number) {
  console.log(`  ${chalk.dim(key + ':')} ${chalk.white(String(value))}`);
}

export function successMsg(msg: string) {
  console.log(`  ${chalk.green('✔')} ${msg}`);
}

export function errorMsg(msg: string) {
  console.log(`  ${chalk.red('✘')} ${msg}`);
}

export function warnMsg(msg: string) {
  console.log(`  ${chalk.yellow('!')} ${msg}`);
}

export function progressBar(current: number, total: number, width = 40): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const label = `${Math.round(pct * 100)}%`;
  return `  ${bar} ${chalk.bold(label)} (${current}/${total})`;
}

export function dimTable(
  rows: { label: string; value: string; count?: number }[],
) {
  const maxLabel = Math.max(...rows.map(r => r.label.length), 10);
  const maxValue = Math.max(...rows.map(r => r.value.length), 10);

  for (const row of rows) {
    const countStr = row.count !== undefined ? chalk.dim(` (n=${row.count})`) : '';
    console.log(
      `  ${chalk.cyan(row.label.padEnd(maxLabel))}  ${chalk.white(row.value.padEnd(maxValue))}${countStr}`,
    );
  }
}

export function scoreBar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  const empty = width - filled;
  const color = score >= 0.7 ? chalk.green : score >= 0.4 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty)) + ` ${(score * 100).toFixed(0)}%`;
}

export function divider() {
  console.log(chalk.dim('  ' + '─'.repeat(55)));
}
