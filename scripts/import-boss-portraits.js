// Import a complete, user-authorized set of boss portraits into both web and APK assets.
// Usage: node scripts/import-boss-portraits.js /path/to/31-portraits
// Source files must be named exactly as the catalog boss names (webp/png/jpg/jpeg).
import { CATALOG } from '../src/catalog.js';
import { mkdir, copyFile, readdir, readFile } from 'node:fs/promises';
import { join, extname, basename, resolve } from 'node:path';

const source = process.argv[2];
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
  for (const name of names) if (!selected.has(name)) errors.push('Missing portrait: ' + name);
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
    for (const dest of ['public/boss-portraits', 'app/src/main/assets/boss-portraits']) {
      await mkdir(dest, { recursive: true });
      for (const [name, file] of selected)
        await copyFile(join(resolve(source), file), join(dest, name + extname(file).toLowerCase()));
    }
    console.log('Imported 31 validated portraits to web and Android assets.');
  }
}
