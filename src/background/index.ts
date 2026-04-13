import { PublicKey, SystemProgram, VersionedMessage } from '@solana/web3.js';
import browser from 'webextension-polyfill';
import { SOLANA_CHAINS } from '../shared/constants';
import { base64ToBytes, bytesToBase64 } from '../shared/encoding';
import { derivePublicKeyBase58, parsePrivateKeyBase58, signBytesDetached } from '../signer/privateKey';
import { getStoredPrivateKey } from '../storage/walletStorage';
import type { ApprovalMethod, ApprovalRequestDto, MessageApprovalPreview, TransactionApprovalPreview } from '../types/approval';
import type {
  WalletAccountDto,
  WalletRpcMethod,
  WalletRpcParamsMap,
  WalletRpcResultMap,
  WalletSignMessageParams,
  WalletSignTransactionParams
} from '../types/messages';
import type {
  ApprovalGetRequestRuntime,
  ApprovalGetResponse,
  ApprovalRespondResponse,
  ApprovalRespondRuntime,
  ExtensionRuntimeRequest,
  WalletRpcRuntimeRequest
} from '../types/runtime';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PREVIEW_INSTRUCTIONS = 8;
const MAX_BASE64_PREVIEW = 220;
const MAX_UTF8_PREVIEW = 220;

interface PendingApproval {
  request: ApprovalRequestDto;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  windowId: number | null;
}

interface HandlerContext {
  origin: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

const makeAccount = (publicKey: string): WalletAccountDto => ({
  address: publicKey,
  publicKey,
  chains: [...SOLANA_CHAINS]
});

const createRequestId = (): string => {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
};

const normalizeOrigin = (origin: unknown): string => {
  if (typeof origin !== 'string' || origin.trim().length === 0 || origin === 'null') {
    return 'unknown';
  }
  return origin;
};

const toPreviewBase64 = (bytes: Uint8Array): string => {
  const full = bytesToBase64(bytes);
  return full.length > MAX_BASE64_PREVIEW ? `${full.slice(0, MAX_BASE64_PREVIEW)}...` : full;
};

const sanitizeText = (value: string): string => {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
};

const lamportsToSol = (lamports: bigint): string => {
  const whole = lamports / 1_000_000_000n;
  const fractionRaw = (lamports % 1_000_000_000n).toString().padStart(9, '0');
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction.length ? `${whole.toString()}.${fraction}` : whole.toString();
};

const decodeSystemTransferLamports = (data: Uint8Array): bigint | null => {
  if (data.length < 12) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const instruction = view.getUint32(0, true);
  if (instruction !== 2) {
    return null;
  }

  return view.getBigUint64(4, true);
};

const resolveKey = (keys: readonly PublicKey[], index: number): string => {
  const key = keys[index];
  return key ? key.toBase58() : `[lookup:${index}]`;
};

const buildTransactionPreview = (params: WalletSignTransactionParams): TransactionApprovalPreview => {
  try {
    const messageBytes = base64ToBytes(params.message);
    const versionedMessage = VersionedMessage.deserialize(messageBytes);
    const staticKeys = versionedMessage.staticAccountKeys;
    const compiledInstructions = versionedMessage.compiledInstructions;

    const instructions = compiledInstructions.slice(0, MAX_PREVIEW_INSTRUCTIONS).map((instruction) => ({
      programId: resolveKey(staticKeys, instruction.programIdIndex),
      accounts: instruction.accountKeyIndexes.map((index) => resolveKey(staticKeys, index)),
      dataBase64: toPreviewBase64(instruction.data)
    }));

    let transfer: TransactionApprovalPreview['transfer'] = null;
    for (const instruction of compiledInstructions) {
      const programId = staticKeys[instruction.programIdIndex];
      if (!programId || !programId.equals(SystemProgram.programId)) {
        continue;
      }

      const lamports = decodeSystemTransferLamports(instruction.data);
      if (lamports === null || instruction.accountKeyIndexes.length < 2) {
        continue;
      }

      transfer = {
        from: resolveKey(staticKeys, instruction.accountKeyIndexes[0]),
        to: resolveKey(staticKeys, instruction.accountKeyIndexes[1]),
        lamports: lamports.toString(),
        sol: lamportsToSol(lamports)
      };
      break;
    }

    const hasAddressLookupReferences = compiledInstructions.some((instruction) => {
      if (instruction.programIdIndex >= staticKeys.length) {
        return true;
      }
      return instruction.accountKeyIndexes.some((index) => index >= staticKeys.length);
    });

    const warning =
      hasAddressLookupReferences || transfer === null
        ? 'Часть данных может быть неполной. Для сложных инструкций показан базовый технический разбор.'
        : null;

    return {
      kind: 'transaction',
      version: versionedMessage.version === 0 ? 'v0' : 'legacy',
      feePayer: staticKeys[0]?.toBase58() ?? null,
      recentBlockhash: versionedMessage.recentBlockhash ?? null,
      instructionCount: compiledInstructions.length,
      transfer,
      instructions,
      hasAddressLookupReferences,
      warning
    };
  } catch {
    return {
      kind: 'transaction',
      version: 'unknown',
      feePayer: null,
      recentBlockhash: null,
      instructionCount: 0,
      transfer: null,
      instructions: [],
      hasAddressLookupReferences: false,
      warning: 'Не удалось разобрать сообщение транзакции. Можно подтвердить только на основе сырого payload.'
    };
  }
};

const buildMessagePreview = (params: WalletSignMessageParams): MessageApprovalPreview => {
  const messageBytes = base64ToBytes(params.message);
  const previewBytes = messageBytes.slice(0, MAX_UTF8_PREVIEW);
  const utf8 = sanitizeText(new TextDecoder().decode(previewBytes));
  return {
    kind: 'message',
    messageLength: messageBytes.length,
    utf8Preview: utf8 || '[binary data]',
    base64Preview: toPreviewBase64(previewBytes)
  };
};

const createApprovalRequest = (
  method: ApprovalMethod,
  origin: string,
  publicKey: string,
  preview: ApprovalRequestDto['preview']
): ApprovalRequestDto => {
  return {
    id: createRequestId(),
    method,
    origin,
    publicKey,
    createdAt: Date.now(),
    preview
  };
};

const popPendingApproval = (requestId: string): PendingApproval | null => {
  const pending = pendingApprovals.get(requestId);
  if (!pending) {
    return null;
  }

  clearTimeout(pending.timeoutId);
  pendingApprovals.delete(requestId);
  return pending;
};

const rejectPendingApproval = (requestId: string, reason: string): void => {
  const pending = popPendingApproval(requestId);
  if (!pending) {
    return;
  }

  if (pending.windowId !== null) {
    void browser.windows.remove(pending.windowId).catch(() => undefined);
  }
  pending.reject(new Error(reason));
};

const approvePendingApproval = (requestId: string): void => {
  const pending = popPendingApproval(requestId);
  if (!pending) {
    return;
  }

  if (pending.windowId !== null) {
    void browser.windows.remove(pending.windowId).catch(() => undefined);
  }
  pending.resolve();
};

const requestUserApproval = async (request: ApprovalRequestDto): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      rejectPendingApproval(request.id, 'Время подтверждения истекло.');
    }, APPROVAL_TIMEOUT_MS);

    pendingApprovals.set(request.id, {
      request,
      resolve,
      reject,
      timeoutId,
      windowId: null
    });

    void (async () => {
      try {
        const windowUrl = browser.runtime.getURL(`confirm.html?requestId=${encodeURIComponent(request.id)}`);
        const createdWindow = await browser.windows.create({
          url: windowUrl,
          type: 'popup',
          width: 440,
          height: 680
        });

        const pending = pendingApprovals.get(request.id);
        if (pending) {
          pending.windowId = createdWindow.id ?? null;
        }
      } catch {
        rejectPendingApproval(request.id, 'Не удалось открыть окно подтверждения подписи.');
      }
    })();
  });
};

const getStoredRequest = async (requestId: string): Promise<ApprovalGetResponse> => {
  return {
    request: pendingApprovals.get(requestId)?.request ?? null
  };
};

const handleApprovalDecision = async (requestId: string, approved: boolean): Promise<ApprovalRespondResponse> => {
  if (!pendingApprovals.has(requestId)) {
    throw new Error('Запрос подтверждения не найден или уже обработан.');
  }

  if (approved) {
    approvePendingApproval(requestId);
  } else {
    rejectPendingApproval(requestId, 'Подпись отклонена пользователем.');
  }

  return { ok: true };
};

const getSignerContext = async (): Promise<{ secretKey: Uint8Array; publicKey: string } | null> => {
  const stored = await getStoredPrivateKey();
  if (!stored) {
    return null;
  }

  try {
    const secretKey = parsePrivateKeyBase58(stored);
    const publicKey = derivePublicKeyBase58(secretKey);
    return { secretKey, publicKey };
  } catch {
    return null;
  }
};

const requireSignerContext = async (): Promise<{ secretKey: Uint8Array; publicKey: string }> => {
  const context = await getSignerContext();
  if (!context) {
    throw new Error('Wallet is not configured. Save a valid private key in extension popup.');
  }
  return context;
};

const handlers: {
  [K in WalletRpcMethod]: (
    params: WalletRpcParamsMap[K],
    context: HandlerContext
  ) => Promise<WalletRpcResultMap[K]>;
} = {
  wallet_get_state: async () => {
    const context = await getSignerContext();
    return {
      configured: Boolean(context),
      publicKey: context?.publicKey ?? null
    };
  },
  wallet_connect: async () => {
    const context = await requireSignerContext();
    return {
      account: makeAccount(context.publicKey)
    };
  },
  wallet_disconnect: async () => {
    return { ok: true };
  },
  wallet_get_account: async () => {
    const context = await getSignerContext();
    return context ? makeAccount(context.publicKey) : null;
  },
  wallet_sign_transaction: async (params, context) => {
    const signer = await requireSignerContext();
    const approvalRequest = createApprovalRequest(
      'wallet_sign_transaction',
      context.origin,
      signer.publicKey,
      buildTransactionPreview(params)
    );
    await requestUserApproval(approvalRequest);

    const message = base64ToBytes(params.message);
    const signature = signBytesDetached(signer.secretKey, message);
    return {
      signature: bytesToBase64(signature),
      publicKey: signer.publicKey
    };
  },
  wallet_sign_message: async (params, context) => {
    const signer = await requireSignerContext();
    const approvalRequest = createApprovalRequest(
      'wallet_sign_message',
      context.origin,
      signer.publicKey,
      buildMessagePreview(params)
    );
    await requestUserApproval(approvalRequest);

    const message = base64ToBytes(params.message);
    const signature = signBytesDetached(signer.secretKey, message);
    return {
      signature: bytesToBase64(signature),
      publicKey: signer.publicKey
    };
  }
};

const isWalletRpcMethod = (value: unknown): value is WalletRpcMethod => {
  return typeof value === 'string' && value in handlers;
};

const isApprovalGetRequest = (value: Partial<ExtensionRuntimeRequest>): value is ApprovalGetRequestRuntime => {
  return value.method === 'approval_get_request' && typeof value.requestId === 'string';
};

const isApprovalRespondRequest = (value: Partial<ExtensionRuntimeRequest>): value is ApprovalRespondRuntime => {
  return (
    value.method === 'approval_respond' &&
    typeof value.requestId === 'string' &&
    typeof value.approved === 'boolean'
  );
};

browser.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of pendingApprovals.entries()) {
    if (pending.windowId === windowId) {
      rejectPendingApproval(requestId, 'Окно подтверждения было закрыто.');
      return;
    }
  }
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  const payload = message as Partial<ExtensionRuntimeRequest>;

  if (isApprovalGetRequest(payload)) {
    return getStoredRequest(payload.requestId);
  }

  if (isApprovalRespondRequest(payload)) {
    return handleApprovalDecision(payload.requestId, payload.approved);
  }

  if (!isWalletRpcMethod(payload.method)) {
    return undefined;
  }

  const method = payload.method;
  const handler = handlers[method] as (params: unknown, context: HandlerContext) => Promise<unknown>;
  const origin = normalizeOrigin((payload as Partial<WalletRpcRuntimeRequest>).origin);
  return handler((payload as Partial<WalletRpcRuntimeRequest>).params, { origin });
});
