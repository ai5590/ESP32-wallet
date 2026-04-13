import browser from 'webextension-polyfill';
import { STORAGE_PRIVATE_KEY } from '../shared/constants';

interface WalletStorageShape {
  [STORAGE_PRIVATE_KEY]?: string;
}

export const getStoredPrivateKey = async (): Promise<string | null> => {
  const result = (await browser.storage.local.get(STORAGE_PRIVATE_KEY)) as WalletStorageShape;
  return result[STORAGE_PRIVATE_KEY] ?? null;
};

export const setStoredPrivateKey = async (privateKeyBase58: string): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_PRIVATE_KEY]: privateKeyBase58 });
};

export const clearStoredPrivateKey = async (): Promise<void> => {
  await browser.storage.local.remove(STORAGE_PRIVATE_KEY);
};
