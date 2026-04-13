import bs58 from 'bs58';
import nacl from 'tweetnacl';

export class PrivateKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateKeyError';
  }
}

const normalizeSecretKey = (decoded: Uint8Array): Uint8Array => {
  if (decoded.length === 64) {
    return decoded;
  }

  if (decoded.length === 32) {
    return nacl.sign.keyPair.fromSeed(decoded).secretKey;
  }

  throw new PrivateKeyError(
    'Неверный формат ключа. Ожидается base58 secret key длиной 64 байта (или seed 32 байта).'
  );
};

export const parsePrivateKeyBase58 = (input: string): Uint8Array => {
  const value = input.trim();
  if (!value) {
    throw new PrivateKeyError('Приватный ключ пустой.');
  }

  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(value);
  } catch {
    throw new PrivateKeyError('Некорректный base58 приватный ключ.');
  }

  return normalizeSecretKey(decoded);
};

export const normalizePrivateKeyBase58 = (input: string): string => {
  const normalized = parsePrivateKeyBase58(input);
  return bs58.encode(normalized);
};

export const derivePublicKeyBase58 = (secretKey: Uint8Array): string => {
  const keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
  return bs58.encode(keyPair.publicKey);
};

export const signBytesDetached = (secretKey: Uint8Array, message: Uint8Array): Uint8Array => {
  return nacl.sign.detached(message, secretKey);
};
