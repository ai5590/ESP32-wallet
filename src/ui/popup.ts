import { derivePublicKeyBase58, normalizePrivateKeyBase58, parsePrivateKeyBase58 } from '../signer/privateKey';
import { getStoredPrivateKey, setStoredPrivateKey } from '../storage/walletStorage';

const privateKeyInput = document.getElementById('privateKey') as HTMLTextAreaElement;
const saveButton = document.getElementById('saveButton') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const publicKeyEl = document.getElementById('publicKey') as HTMLElement;
const errorEl = document.getElementById('error') as HTMLParagraphElement;

const renderNotConfigured = (): void => {
  statusEl.textContent = 'Кошелёк не настроен: приватный ключ не сохранён.';
  publicKeyEl.textContent = '—';
};

const renderConfigured = (publicKey: string): void => {
  statusEl.textContent = 'Ключ сохранён. Кошелёк готов.';
  publicKeyEl.textContent = publicKey;
};

const clearError = (): void => {
  errorEl.textContent = '';
};

const showError = (message: string): void => {
  errorEl.textContent = message;
};

const loadCurrentState = async (): Promise<void> => {
  clearError();
  const stored = await getStoredPrivateKey();
  if (!stored) {
    privateKeyInput.value = '';
    renderNotConfigured();
    return;
  }

  try {
    const secretKey = parsePrivateKeyBase58(stored);
    const publicKey = derivePublicKeyBase58(secretKey);
    privateKeyInput.value = stored;
    renderConfigured(publicKey);
  } catch {
    renderNotConfigured();
    showError('В storage сохранён некорректный ключ. Введите и сохраните новый.');
  }
};

const savePrivateKey = async (): Promise<void> => {
  clearError();
  const rawValue = privateKeyInput.value;

  try {
    const normalized = normalizePrivateKeyBase58(rawValue);
    const secretKey = parsePrivateKeyBase58(normalized);
    const publicKey = derivePublicKeyBase58(secretKey);

    await setStoredPrivateKey(normalized);
    privateKeyInput.value = normalized;
    renderConfigured(publicKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить ключ.';
    showError(message);
    renderNotConfigured();
  }
};

saveButton.addEventListener('click', () => {
  void savePrivateKey();
});

void loadCurrentState();
