// Refresh bundled offline copies of the uBO 1.76.0 default lists.
// Runtime updates still use the URLs in assets.json.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

const root = resolve('formant/ublock/assets');
const catalog = JSON.parse(await readFile(join(root, 'assets.json'), 'utf8'));
const files = {
  'ublock-filters': 'ublock/filters.min.txt',
  'ublock-badware': 'ublock/badware.min.txt',
  'ublock-privacy': 'ublock/privacy.min.txt',
  'ublock-quick-fixes': 'ublock/quick-fixes.min.txt',
  'ublock-unbreak': 'ublock/unbreak.min.txt',
  easylist: 'thirdparties/easylist/easylist.txt',
  easyprivacy: 'thirdparties/easylist/easyprivacy.txt',
  'urlhaus-1': 'thirdparties/urlhaus-filter/urlhaus-filter-online.txt',
  'plowe-0': 'thirdparties/pgl.yoyo.org/as/serverlist.txt',
  'CHN-0': 'thirdparties/adguard/chinese.txt',
};

await Promise.all(Object.entries(files).map(async ([id, path]) => {
  const entry = catalog[id];
  const urls = [entry.cdnURLs, entry.contentURL].flat().filter((url) => /^https:\/\//.test(url));
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${response.status}`);
      const text = await response.text();
      if (text.length < 32) throw new Error('empty list');
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
      console.log(id, text.length, url);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${id}: ${lastError}`);
}));
