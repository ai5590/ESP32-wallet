import {
  SolanaSignMessage,
  type SolanaSignMessageInput,
  type SolanaSignMessageOutput,
  SolanaSignTransaction,
  type SolanaSignTransactionInput,
  type SolanaSignTransactionOutput,
  type SolanaTransactionVersion
} from '@solana/wallet-standard-features';
import {
  type Wallet,
  type WalletAccount,
  type WalletEventsWindow,
  type WalletIcon,
  type WalletWithFeatures
} from '@wallet-standard/base';
import {
  StandardConnect,
  type StandardConnectFeature,
  type StandardConnectInput,
  type StandardConnectOutput,
  StandardDisconnect,
  type StandardDisconnectFeature,
  StandardEvents,
  type StandardEventsChangeProperties,
  type StandardEventsFeature,
  type StandardEventsNames
} from '@wallet-standard/features';
import { ReadonlyWalletAccount, registerWallet } from '@wallet-standard/wallet';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  BRIDGE_CHANNEL,
  BRIDGE_DIRECTION_REQUEST,
  BRIDGE_DIRECTION_RESPONSE,
  SOLANA_CHAINS,
  WALLET_ICON,
  WALLET_NAME
} from '../shared/constants';
import { base64ToBytes, bytesToBase64 } from '../shared/encoding';
import type {
  BridgeRequestEnvelope,
  BridgeResponseEnvelope,
  WalletRpcMethod,
  WalletRpcParamsMap,
  WalletRpcResultMap
} from '../types/messages';

type SolanaWalletFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature & {
    readonly [SolanaSignTransaction]: {
      readonly version: '1.0.0';
      readonly supportedTransactionVersions: readonly SolanaTransactionVersion[];
      readonly signTransaction: (...inputs: readonly SolanaSignTransactionInput[]) => Promise<
        readonly SolanaSignTransactionOutput[]
      >;
    };
    readonly [SolanaSignMessage]: {
      readonly version: '1.0.0';
      readonly signMessage: (...inputs: readonly SolanaSignMessageInput[]) => Promise<
        readonly SolanaSignMessageOutput[]
      >;
    };
  };

type SolanaWalletStandard = WalletWithFeatures<SolanaWalletFeatures>;

type LegacyEventName = 'connect' | 'disconnect' | 'accountChanged';
type LegacyEventListener = (...args: unknown[]) => void;

interface LegacySolanaProvider {
  readonly isEspWallet: true;
  readonly isConnected: boolean;
  readonly publicKey: PublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends unknown>(transaction: T): Promise<T>;
  signMessage(message: Uint8Array | ArrayBuffer | number[] | string): Promise<{
    publicKey: PublicKey;
    signature: Uint8Array;
  }>;
  request(args: {
    method: string;
    params?: unknown;
  }): Promise<unknown>;
  on(event: LegacyEventName, listener: LegacyEventListener): this;
  off(event: LegacyEventName, listener: LegacyEventListener): this;
}

interface LegacyTransactionLike {
  serializeMessage(): Uint8Array;
  addSignature(publicKey: PublicKey, signature: Uint8Array): void;
}

interface VersionedTransactionLike {
  message: { serialize(): Uint8Array };
  addSignature(publicKey: PublicKey, signature: Uint8Array): void;
}

type SignableTransaction = LegacyTransactionLike | VersionedTransactionLike;

const isLegacyTransactionLike = (value: unknown): value is LegacyTransactionLike => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<LegacyTransactionLike>;
  return (
    typeof candidate.serializeMessage === 'function' && typeof candidate.addSignature === 'function'
  );
};

const isVersionedTransactionLike = (value: unknown): value is VersionedTransactionLike => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VersionedTransactionLike>;
  return (
    typeof candidate.addSignature === 'function' &&
    Boolean(candidate.message) &&
    typeof candidate.message?.serialize === 'function'
  );
};

const toBytes = (value: Uint8Array | ArrayBuffer | number[] | string): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  return new TextEncoder().encode(value);
};

class BridgeClient {
  private readonly pending = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();

  constructor() {
    window.addEventListener('message', this.handleResponse);
  }

  request<M extends WalletRpcMethod>(
    method: M,
    params: WalletRpcParamsMap[M]
  ): Promise<WalletRpcResultMap[M]> {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const payload: BridgeRequestEnvelope<M> = {
      channel: BRIDGE_CHANNEL,
      direction: BRIDGE_DIRECTION_REQUEST,
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.postMessage(payload, '*');
    }) as Promise<WalletRpcResultMap[M]>;
  }

  private readonly handleResponse = (event: MessageEvent<unknown>): void => {
    if (event.source !== window) {
      return;
    }
    const data = event.data as Partial<BridgeResponseEnvelope>;
    if (
      data?.channel !== BRIDGE_CHANNEL ||
      data.direction !== BRIDGE_DIRECTION_RESPONSE ||
      typeof data.id !== 'string'
    ) {
      return;
    }

    const pending = this.pending.get(data.id);
    if (!pending) {
      return;
    }

    this.pending.delete(data.id);
    if ('error' in data && data.error) {
      pending.reject(new Error(data.error.message || 'Wallet bridge request failed.'));
      return;
    }

    pending.resolve((data as { result: unknown }).result);
  };
}

class EventEmitter {
  private readonly listeners = new Map<LegacyEventName, Set<LegacyEventListener>>();

  on(event: LegacyEventName, listener: LegacyEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: LegacyEventName, listener: LegacyEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: LegacyEventName, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(...args);
      } catch {
        // Legacy listeners should not break provider execution.
      }
    }
  }
}

class EspSolanaProvider implements LegacySolanaProvider {
  readonly isEspWallet = true as const;
  isConnected = false;
  publicKey: PublicKey | null = null;

  private readonly bridge = new BridgeClient();
  private readonly emitter = new EventEmitter();
  private readonly standardListeners = new Set<
    (properties: StandardEventsChangeProperties) => void
  >();

  private connectedAccount: WalletAccount | null = null;

  async connect(_options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }> {
    const response = await this.bridge.request('wallet_connect', undefined);
    this.setConnectedPublicKey(response.account.publicKey);
    this.isConnected = true;
    this.emitter.emit('connect', this.publicKey);
    this.emitter.emit('accountChanged', this.publicKey);
    this.emitStandardChange();
    return { publicKey: this.publicKey as PublicKey };
  }

  async disconnect(): Promise<void> {
    await this.bridge.request('wallet_disconnect', undefined);
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.publicKey = null;
    this.connectedAccount = null;
    if (wasConnected) {
      this.emitter.emit('disconnect');
      this.emitter.emit('accountChanged', null);
      this.emitStandardChange();
    }
  }

  async signTransaction<T extends unknown>(transaction: T): Promise<T> {
    this.assertConnected();

    const transactionLike = transaction as SignableTransaction;
    let messageBytes: Uint8Array;

    if (isLegacyTransactionLike(transactionLike)) {
      messageBytes = transactionLike.serializeMessage();
    } else if (isVersionedTransactionLike(transactionLike)) {
      messageBytes = transactionLike.message.serialize();
    } else {
      throw new Error('Unsupported transaction type. Expected legacy or versioned Solana transaction.');
    }

    const response = await this.bridge.request('wallet_sign_transaction', {
      message: bytesToBase64(messageBytes)
    });
    const signature = base64ToBytes(response.signature);
    const signer = new PublicKey(response.publicKey);
    transactionLike.addSignature(signer, Buffer.from(signature));
    return transaction;
  }

  async signMessage(message: Uint8Array | ArrayBuffer | number[] | string): Promise<{
    publicKey: PublicKey;
    signature: Uint8Array;
  }> {
    this.assertConnected();
    const messageBytes = toBytes(message);
    const response = await this.bridge.request('wallet_sign_message', {
      message: bytesToBase64(messageBytes)
    });
    return {
      publicKey: new PublicKey(response.publicKey),
      signature: base64ToBytes(response.signature)
    };
  }

  async request(args: { method: string; params?: unknown }): Promise<unknown> {
    switch (args.method) {
      case 'connect':
        return this.connect(args.params as { onlyIfTrusted?: boolean } | undefined);
      case 'disconnect':
        return this.disconnect();
      case 'signTransaction':
        return this.signTransaction(args.params);
      case 'signMessage':
        return this.signMessage(args.params as Uint8Array | ArrayBuffer | number[] | string);
      default:
        throw new Error(`Unsupported request method: ${args.method}`);
    }
  }

  on(event: LegacyEventName, listener: LegacyEventListener): this {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: LegacyEventName, listener: LegacyEventListener): this {
    this.emitter.off(event, listener);
    return this;
  }

  getWalletStandard(): SolanaWalletStandard {
    return {
      version: '1.0.0',
      name: WALLET_NAME,
      icon: WALLET_ICON as WalletIcon,
      chains: [...SOLANA_CHAINS],
      features: {
        [StandardConnect]: {
          version: '1.0.0',
          connect: async (input?: StandardConnectInput): Promise<StandardConnectOutput> => {
            if (input?.silent && this.isConnected) {
              return { accounts: this.getStandardAccounts() };
            }
            await this.connect();
            return { accounts: this.getStandardAccounts() };
          }
        },
        [StandardDisconnect]: {
          version: '1.0.0',
          disconnect: async (): Promise<void> => {
            await this.disconnect();
          }
        },
        [StandardEvents]: {
          version: '1.0.0',
          on: (event: StandardEventsNames, listener: (properties: StandardEventsChangeProperties) => void) => {
            if (event !== 'change') {
              return () => undefined;
            }
            this.standardListeners.add(listener);
            return () => {
              this.standardListeners.delete(listener);
            };
          }
        },
        [SolanaSignTransaction]: {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signTransaction: async (...inputs: readonly SolanaSignTransactionInput[]) => {
            this.assertConnected();
            return Promise.all(
              inputs.map(async (input): Promise<SolanaSignTransactionOutput> => {
                this.assertAccount(input.account);
                const signedTransaction = await this.signSerializedTransaction(input.transaction);
                return { signedTransaction };
              })
            );
          }
        },
        [SolanaSignMessage]: {
          version: '1.0.0',
          signMessage: async (...inputs: readonly SolanaSignMessageInput[]) => {
            this.assertConnected();
            return Promise.all(
              inputs.map(async (input): Promise<SolanaSignMessageOutput> => {
                this.assertAccount(input.account);
                const response = await this.bridge.request('wallet_sign_message', {
                  message: bytesToBase64(input.message)
                });
                return {
                  signedMessage: input.message,
                  signature: base64ToBytes(response.signature),
                  signatureType: 'ed25519'
                };
              })
            );
          }
        }
      },
      get accounts() {
        return provider.getStandardAccounts();
      }
    };
  }

  private async signSerializedTransaction(transactionBytes: Uint8Array): Promise<Uint8Array> {
    let versionedTx: VersionedTransaction | null = null;
    try {
      versionedTx = VersionedTransaction.deserialize(transactionBytes);
    } catch {
      versionedTx = null;
    }

    if (versionedTx) {
      const response = await this.bridge.request('wallet_sign_transaction', {
        message: bytesToBase64(versionedTx.message.serialize())
      });
      versionedTx.addSignature(
        new PublicKey(response.publicKey),
        Buffer.from(base64ToBytes(response.signature))
      );
      return versionedTx.serialize();
    }

    const tx = Transaction.from(transactionBytes);
    const response = await this.bridge.request('wallet_sign_transaction', {
      message: bytesToBase64(tx.serializeMessage())
    });
    tx.addSignature(new PublicKey(response.publicKey), Buffer.from(base64ToBytes(response.signature)));
    return tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
  }

  private getStandardAccounts(): readonly WalletAccount[] {
    return this.connectedAccount ? [this.connectedAccount] : [];
  }

  private assertConnected(): void {
    if (!this.isConnected || !this.publicKey) {
      throw new Error('Wallet is not connected.');
    }
  }

  private assertAccount(account: WalletAccount): void {
    this.assertConnected();
    if (account.address !== this.publicKey?.toBase58()) {
      throw new Error('Requested account is not currently connected.');
    }
  }

  private setConnectedPublicKey(publicKeyBase58: string): void {
    this.publicKey = new PublicKey(publicKeyBase58);
    this.connectedAccount = new ReadonlyWalletAccount({
      address: publicKeyBase58,
      publicKey: bs58.decode(publicKeyBase58),
      chains: [...SOLANA_CHAINS],
      features: [SolanaSignTransaction, SolanaSignMessage],
      label: WALLET_NAME,
      icon: WALLET_ICON as WalletIcon
    });
  }

  private emitStandardChange(): void {
    const payload: StandardEventsChangeProperties = {
      accounts: this.getStandardAccounts()
    };
    for (const listener of this.standardListeners) {
      try {
        listener(payload);
      } catch {
        // Wallet-standard listeners are isolated from one another.
      }
    }
  }
}

const provider = new EspSolanaProvider();
const walletStandard = provider.getWalletStandard();
registerWallet(walletStandard as Wallet);

const walletWindow = window as Window & WalletEventsWindow & {
  solana?: LegacySolanaProvider;
  espWallet?: LegacySolanaProvider;
};

if (!walletWindow.solana) {
  Object.defineProperty(walletWindow, 'solana', {
    value: provider,
    writable: false,
    configurable: false
  });
}

walletWindow.espWallet = provider;
