/** Tiny assertion helper shared by the MVP check scripts (same style as the existing `tsx` checks). */
let failures = 0;
let passes = 0;

export function check(cond: unknown, msg: string): void {
  if (cond) {
    passes += 1;
    if (process.env.MVP_VERBOSE) console.log(`OK: ${msg}`);
  } else {
    failures += 1;
    process.exitCode = 1;
    console.error(`FAIL: ${msg}`);
  }
}

export function eq<T>(actual: T, expected: T, msg: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(ok, ok ? msg : `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export async function rejects(fn: () => Promise<unknown>, includes: string, msg: string): Promise<void> {
  try {
    await fn();
    check(false, `${msg} — expected an error containing "${includes}", but it succeeded`);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    check(text.includes(includes), text.includes(includes) ? msg : `${msg} — got "${text}"`);
  }
}

export function summary(name: string): void {
  const line = `${name}: ${passes} passed, ${failures} failed`;
  if (failures) console.error(`FAIL ${line}`);
  else console.log(`PASS ${line}`);
}
