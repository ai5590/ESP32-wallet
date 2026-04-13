export type ApprovalMethod = 'wallet_sign_transaction' | 'wallet_sign_message';

export interface TransactionTransferPreview {
  from: string;
  to: string;
  lamports: string;
  sol: string;
}

export interface TransactionInstructionPreview {
  programId: string;
  accounts: string[];
  dataBase64: string;
}

export interface TransactionApprovalPreview {
  kind: 'transaction';
  version: 'legacy' | 'v0' | 'unknown';
  feePayer: string | null;
  recentBlockhash: string | null;
  instructionCount: number;
  transfer: TransactionTransferPreview | null;
  instructions: TransactionInstructionPreview[];
  hasAddressLookupReferences: boolean;
  warning: string | null;
}

export interface MessageApprovalPreview {
  kind: 'message';
  messageLength: number;
  utf8Preview: string;
  base64Preview: string;
}

export type ApprovalPreview = TransactionApprovalPreview | MessageApprovalPreview;

export interface ApprovalRequestDto {
  id: string;
  method: ApprovalMethod;
  origin: string;
  publicKey: string;
  createdAt: number;
  preview: ApprovalPreview;
}
