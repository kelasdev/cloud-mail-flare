import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('.svelte-kit', 'cloudflare');
const maxAttempts = 6;
const delayMs = 300;

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    rmSync(target, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    const locked =
      error &&
      typeof error === 'object' &&
      ('code' in error ? error.code === 'EPERM' || error.code === 'EBUSY' : false);

    if (!locked || attempt === maxAttempts) {
      throw error;
    }

    await sleep(delayMs * attempt);
  }
}
