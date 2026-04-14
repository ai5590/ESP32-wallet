const LINKS = {
  releaseLatest: "https://github.com/ai5590/ESP32-wallet/releases/latest",
  repo: "https://github.com/ai5590/ESP32-wallet"
};

function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) return "firefox";
  if (/Edg/i.test(ua)) return "edge";
  if (/OPR|Opera/i.test(ua)) return "opera";
  if (/Chrome/i.test(ua)) return "chrome";
  return "unknown";
}

function getBrowserLabel(browser) {
  if (browser === "firefox") return "Обнаружен браузер: Firefox";
  if (browser === "edge") return "Обнаружен браузер: Microsoft Edge";
  if (browser === "opera") return "Обнаружен браузер: Opera";
  if (browser === "chrome") return "Обнаружен браузер: Chrome";
  return "Браузер не распознан, используем универсальные ссылки.";
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function loadBuildFiles() {
  const response = await fetch("./downloads/files.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Файл docs/downloads/files.json не найден.");
  }
  return response.json();
}

async function initPage() {
  const browser = detectBrowser();
  const installLink = document.getElementById("smartInstallLink");
  const latestReleaseLink = document.getElementById("latestReleaseLink");
  const browserLabel = document.getElementById("browserLabel");
  const buildInfo = document.getElementById("buildInfo");
  const downloadChromium = document.getElementById("downloadChromium");
  const downloadFirefox = document.getElementById("downloadFirefox");

  installLink.href = "#";
  latestReleaseLink.href = LINKS.releaseLatest;
  browserLabel.textContent = getBrowserLabel(browser);

  try {
    const manifest = await loadBuildFiles();
    const chromiumFile = manifest.files.find((item) => item.browser === "chromium");
    const firefoxFile = manifest.files.find((item) => item.browser === "firefox");

    if (chromiumFile) {
      downloadChromium.href = chromiumFile.path;
      downloadChromium.textContent = `Скачать Chromium (${formatSize(chromiumFile.sizeBytes)})`;
    }
    if (firefoxFile) {
      downloadFirefox.href = firefoxFile.path;
      downloadFirefox.textContent = `Скачать Firefox (${formatSize(firefoxFile.sizeBytes)})`;
    }

    if (browser === "firefox" && firefoxFile) {
      installLink.href = firefoxFile.path;
    } else if (chromiumFile) {
      installLink.href = chromiumFile.path;
    }

    const dt = new Date(manifest.generatedAt);
    buildInfo.textContent = `Версия: ${manifest.version}. Сборки обновлены: ${dt.toLocaleString()}.`;
  } catch (error) {
    buildInfo.textContent =
      "Файлы сборки пока не опубликованы. Выполните npm run build:site и закоммитьте docs/downloads.";
    installLink.href = LINKS.releaseLatest;
  }
}

void initPage();
