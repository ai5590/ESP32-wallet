import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const docsDownloadsDir = path.join(rootDir, 'docs', 'downloads');
const chromiumDistDir = path.join(rootDir, 'dist', 'chromium');
const firefoxDistDir = path.join(rootDir, 'dist', 'firefox');
const packageJsonPath = path.join(rootDir, 'package.json');

const ensureZipExists = () => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
  } catch {
    throw new Error('Команда "zip" не найдена. Установите zip и повторите build:site.');
  }
};

const ensureDirExists = async (dirPath) => {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Ожидается директория: ${dirPath}`);
    }
  } catch {
    throw new Error(`Не найдена директория сборки: ${dirPath}. Сначала выполните npm run build.`);
  }
};

const createZipFromDir = (sourceDir, outputFilePath) => {
  execFileSync('zip', ['-r', '-q', outputFilePath, '.'], { cwd: sourceDir, stdio: 'inherit' });
};

const main = async () => {
  ensureZipExists();
  await ensureDirExists(chromiumDistDir);
  await ensureDirExists(firefoxDistDir);

  await fs.mkdir(docsDownloadsDir, { recursive: true });

  const chromiumZipName = 'esp-wallet-chromium.zip';
  const firefoxZipName = 'esp-wallet-firefox.zip';
  const chromiumZipPath = path.join(docsDownloadsDir, chromiumZipName);
  const firefoxZipPath = path.join(docsDownloadsDir, firefoxZipName);

  await fs.rm(chromiumZipPath, { force: true });
  await fs.rm(firefoxZipPath, { force: true });

  createZipFromDir(chromiumDistDir, chromiumZipPath);
  createZipFromDir(firefoxDistDir, firefoxZipPath);

  const [chromiumZipStat, firefoxZipStat] = await Promise.all([
    fs.stat(chromiumZipPath),
    fs.stat(firefoxZipPath)
  ]);

  const packageRaw = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageRaw);
  const version = packageJson.version ?? '0.0.0';
  const generatedAt = new Date().toISOString();

  const filesManifest = {
    project: 'ESP32-wallet',
    version,
    generatedAt,
    files: [
      {
        browser: 'chromium',
        name: chromiumZipName,
        path: `./downloads/${chromiumZipName}`,
        sizeBytes: chromiumZipStat.size
      },
      {
        browser: 'firefox',
        name: firefoxZipName,
        path: `./downloads/${firefoxZipName}`,
        sizeBytes: firefoxZipStat.size
      }
    ]
  };

  await fs.writeFile(
    path.join(docsDownloadsDir, 'files.json'),
    JSON.stringify(filesManifest, null, 2),
    'utf8'
  );

  console.log('Сайт обновлен: docs/downloads/*.zip и docs/downloads/files.json');
};

await main();
