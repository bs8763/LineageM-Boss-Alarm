// Import a complete, user-authorized set of boss portraits into both web and APK assets.
// Usage: node scripts/import-boss-portraits.js /path/to/31-portraits [--partial]
// --partial imports available valid portraits without requiring all 31.
// Source files must be named exactly as the catalog boss names (webp/png/jpg/jpeg).
import { fileURLToPath } from 'node:url';
import { CATALOG } from '../src/catalog.js';
import { mkdir, copyFile, readdir, readFile, rm } from 'node:fs/promises';
import { join, extname, basename, resolve, dirname } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
const partial = process.argv.slice(3).includes('--partial');
if (!source) {
  console.error('Usage: node scripts/import-boss-portraits.js <source-directory>');
  process.exitCode = 2;
} else {
  const formats = new Set(['.webp', '.png', '.jpg', '.jpeg']);
  const names = CATALOG.map(b => b.name);
  const files = await readdir(resolve(source));
  const selected = new Map();
  const errors = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const name = basename(file, ext);
    if (!formats.has(ext) || !names.includes(name)) continue;
    if (selected.has(name)) errors.push('Duplicate portrait: ' + name);
    else selected.set(name, file);
  }
  if (!partial) for (const name of names) if (!selected.has(name)) errors.push('Missing portrait: ' + name);
  if (partial && selected.size === 0) errors.push('No matching boss portraits found');
  if (names.length !== 31 || new Set(names).size !== 31) errors.push('Catalog is not 31 unique bosses');
  // Check image signatures before writing any destination file.
  for (const [name, file] of selected) {
    const data = await readFile(join(resolve(source), file));
    const ext = extname(file).toLowerCase();
    const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
    const webp = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (data.length < 128 || !(ext === '.png' ? png : ext === '.webp' ? webp : jpeg))
      errors.push('Invalid image: ' + name);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    for (const relativeDest of ['public/boss-portraits', 'app/src/main/assets/boss-portraits']) {
      const dest = join(projectRoot, relativeDest);
      await mkdir(dest, { recursive: true });
      for (const [name, file] of selected) {
        // Remove stale formats so the app's WebP-first fallback cannot display an old portrait.
        for (const ext of formats) await rm(join(dest, name + ext), { force: true });
        await copyFile(join(resolve(source), file), join(dest, name + extname(file).toLowerCase()));
      }
    }
    console.log(`Imported ${selected.size}/31 validated portraits to web and Android assets.`);
    if (partial) console.log(`Still missing ${names.length - selected.size} portraits from this source directory.`);
  }
}
