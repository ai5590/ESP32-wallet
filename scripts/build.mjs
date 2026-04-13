import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2];
const allowedTargets = new Set(['chromium', 'firefox']);

if (!target || !allowedTargets.has(target)) {
  throw new Error('Usage: node scripts/build.mjs <chromium|firefox>');
}

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, 'dist', target);
const manifestDir = path.join(projectRoot, 'manifests');

const entryBuilds = [
  { entry: 'src/background/index.ts', outfile: 'background.js' },
  { entry: 'src/content/index.ts', outfile: 'content.js' },
  { entry: 'src/injected/provider.ts', outfile: 'injected.js' },
  { entry: 'src/ui/popup.ts', outfile: 'popup.js' },
  { entry: 'src/ui/confirm.ts', outfile: 'confirm.js' }
];

const deepMerge = (base, override) => {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }
  if (typeof base !== 'object' || typeof override !== 'object' || !base || !override) {
    return override ?? base;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result;
};

const copyStaticAssets = async () => {
  const assets = ['popup.html', 'popup.css', 'confirm.html', 'confirm.css'];
  await Promise.all(
    assets.map((asset) =>
      fs.copyFile(path.join(projectRoot, 'src/ui', asset), path.join(outDir, asset))
    )
  );
};

const writeManifest = async () => {
  const baseManifestRaw = await fs.readFile(path.join(manifestDir, 'manifest.base.json'), 'utf8');
  const overrideManifestRaw = await fs.readFile(path.join(manifestDir, `manifest.${target}.json`), 'utf8');
  const baseManifest = JSON.parse(baseManifestRaw);
  const overrideManifest = JSON.parse(overrideManifestRaw);
  const mergedManifest = deepMerge(baseManifest, overrideManifest);

  if (target === 'firefox' && mergedManifest.background?.scripts) {
    delete mergedManifest.background.service_worker;
  }
  if (target === 'chromium' && mergedManifest.background?.service_worker) {
    delete mergedManifest.background.scripts;
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(mergedManifest, null, 2));
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const { entry, outfile } of entryBuilds) {
  await build({
    entryPoints: [path.join(projectRoot, entry)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    outfile: path.join(outDir, outfile),
    legalComments: 'none'
  });
}

await copyStaticAssets();
await writeManifest();

console.log(`Build complete: ${outDir}`);
