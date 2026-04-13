import type { ApprovalRequestDto } from './approval';
import type { WalletRpcMethod, WalletRpcParamsMap } from './messages';

export type WalletRpcRuntimeRequest<M extends WalletRpcMethod = WalletRpcMethod> = {
  method: M;
  params: WalletRpcParamsMap[M];
  origin?: string;
};

export interface ApprovalGetRequestRuntime {
  method: 'approval_get_request';
  requestId: string;
}

export interface ApprovalRespondRuntime {
  method: 'approval_respond';
  requestId: string;
  approved: boolean;
}

export type ExtensionRuntimeRequest =
  | WalletRpcRuntimeRequest
  | ApprovalGetRequestRuntime
  | ApprovalRespondRuntime;

export interface ApprovalGetResponse {
  request: ApprovalRequestDto | null;
}

export interface ApprovalRespondResponse {
  ok: true;
}
