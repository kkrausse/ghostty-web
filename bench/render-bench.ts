/**
 * A/B render-pass benchmark: patched lib (../lib) vs stock npm dist.
 * Run: bun --preload ./happydom.ts bench/render-bench.ts <path-to-stock-ghostty-web-root>
 *
 * Canvas 2D is mocked by happydom.ts, so timings capture the data path
 * (WASM extraction, cell parsing, allocation) — the part the patch changes —
 * not rasterization, which is identical in both builds.
 */

const COLS = 220;
const ROWS = 60;
const REPS = 300;

function p(arr: number[], q: number): string {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(2);
}

async function bench(label: string, mod: any, wasmPath: string) {
  const ghostty = await mod.Ghostty.load(wasmPath);
  const term = new mod.Terminal({ ghostty, cols: COLS, rows: ROWS, cursorBlink: false });
  const div = document.createElement('div');
  document.body.appendChild(div);
  term.open(div);
  (term as any).cancelRenderLoop?.(); // manual render calls only

  const render = () => term.renderer.render(term.wasmTerm, false, term.viewportY ?? 0, term);

  // Fill the screen with styled content
  for (let i = 0; i < ROWS; i++) {
    term.write(`\x1b[3${(i % 6) + 1}mline ${i} ${'lorem ipsum dolor sit amet '.repeat(6)}\x1b[0m\r\n`);
  }
  render();

  // Scenario 1: single-char echo (plain typing)
  const echo: number[] = [];
  for (let i = 0; i < REPS; i++) {
    term.write('a');
    const t = performance.now();
    render();
    echo.push(performance.now() - t);
  }

  // Scenario 2: TUI-style update touching ~30 rows (Claude Code / Emacs-like)
  let tui30 = '';
  for (let r = 10; r < 40; r++) tui30 += `\x1b[${r};1Hrow ${r} update ${'x'.repeat(80)}`;
  const tui: number[] = [];
  for (let i = 0; i < REPS; i++) {
    term.write(tui30 + `\x1b[${(i % 20) + 10};${(i % 40) + 1}H`);
    const t = performance.now();
    render();
    tui.push(performance.now() - t);
  }

  // Scenario 3: idle frame (nothing dirty)
  const idle: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const t = performance.now();
    render();
    idle.push(performance.now() - t);
  }

  console.log(
    `${label.padEnd(8)} echo p50=${p(echo, 0.5)}ms p95=${p(echo, 0.95)}ms | ` +
      `tui30 p50=${p(tui, 0.5)}ms p95=${p(tui, 0.95)}ms | idle p50=${p(idle, 0.5)}ms p95=${p(idle, 0.95)}ms`
  );
  term.dispose?.();
}

const stockRoot = process.argv[2];
if (!stockRoot) throw new Error('usage: bun --preload ./happydom.ts bench/render-bench.ts <stock-ghostty-web-root>');

console.log(`terminal ${COLS}x${ROWS}, ${REPS} reps per scenario`);
const stock = await import(`${stockRoot}/dist/ghostty-web.js`);
await bench('stock', stock, `${stockRoot}/ghostty-vt.wasm`);
const patched = await import('../lib/index');
await bench('patched', patched, `${import.meta.dir}/../ghostty-vt.wasm`);
process.exit(0);
