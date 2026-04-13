export type WalletRpcMethod =
  | 'wallet_get_state'
  | 'wallet_connect'
  | 'wallet_disconnect'
  | 'wallet_get_account'
  | 'wallet_sign_transaction'
  | 'wallet_sign_message';

export interface WalletState {
  configured: boolean;
  publicKey: string | null;
}

export interface WalletAccountDto {
  address: string;
  publicKey: string;
  chains: string[];
}

export interface WalletConnectResult {
  account: WalletAccountDto;
}

export interface WalletSignTransactionParams {
  message: string;
}

export interface WalletSignTransactionResult {
  signature: string;
  publicKey: string;
}

export interface WalletSignMessageParams {
  message: string;
}

export interface WalletSignMessageResult {
  signature: string;
  publicKey: string;
}

export interface WalletRpcParamsMap {
  wallet_get_state: undefined;
  wallet_connect: undefined;
  wallet_disconnect: undefined;
  wallet_get_account: undefined;
  wallet_sign_transaction: WalletSignTransactionParams;
  wallet_sign_message: WalletSignMessageParams;
}

export interface WalletRpcResultMap {
  wallet_get_state: WalletState;
  wallet_connect: WalletConnectResult;
  wallet_disconnect: { ok: true };
  wallet_get_account: WalletAccountDto | null;
  wallet_sign_transaction: WalletSignTransactionResult;
  wallet_sign_message: WalletSignMessageResult;
}

export interface BridgeRequestEnvelope<M extends WalletRpcMethod = WalletRpcMethod> {
  channel: string;
  direction: string;
  id: string;
  method: M;
  params: WalletRpcParamsMap[M];
}

export type BridgeResponseEnvelope =
  | {
      channel: string;
      direction: string;
      id: string;
      result: unknown;
    }
  | {
      channel: string;
      direction: string;
      id: string;
      error: {
        message: string;
      };
    };

export const isBridgeRequest = (value: unknown): value is BridgeRequestEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BridgeRequestEnvelope>;
  return (
    typeof candidate.channel === 'string' &&
    typeof candidate.direction === 'string' &&
    typeof candidate.id === 'string' &&
    typeof candidate.method === 'string'
  );
};
