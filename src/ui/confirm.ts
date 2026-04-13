import browser from 'webextension-polyfill';
import type { ApprovalRequestDto, MessageApprovalPreview, TransactionApprovalPreview } from '../types/approval';
import type { ApprovalGetResponse } from '../types/runtime';

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const originEl = document.getElementById('origin') as HTMLElement;
const methodEl = document.getElementById('method') as HTMLParagraphElement;
const accountEl = document.getElementById('account') as HTMLElement;
const detailsEl = document.getElementById('details') as HTMLPreElement;

const transactionCard = document.getElementById('transactionCard') as HTMLElement;
const txVersionEl = document.getElementById('txVersion') as HTMLSpanElement;
const txFeePayerEl = document.getElementById('txFeePayer') as HTMLElement;
const txBlockhashEl = document.getElementById('txBlockhash') as HTMLElement;
const txInstructionCountEl = document.getElementById('txInstructionCount') as HTMLSpanElement;
const transferBox = document.getElementById('transferBox') as HTMLElement;
const transferFromEl = document.getElementById('transferFrom') as HTMLElement;
const transferToEl = document.getElementById('transferTo') as HTMLElement;
const transferAmountEl = document.getElementById('transferAmount') as HTMLSpanElement;
const txWarningEl = document.getElementById('txWarning') as HTMLParagraphElement;

const messageCard = document.getElementById('messageCard') as HTMLElement;
const msgLengthEl = document.getElementById('msgLength') as HTMLSpanElement;
const msgUtf8El = document.getElementById('msgUtf8') as HTMLPreElement;
const msgBase64El = document.getElementById('msgBase64') as HTMLElement;

const approveButton = document.getElementById('approveButton') as HTMLButtonElement;
const rejectButton = document.getElementById('rejectButton') as HTMLButtonElement;

const query = new URLSearchParams(window.location.search);
const requestId = query.get('requestId');

const setButtonsDisabled = (disabled: boolean): void => {
  approveButton.disabled = disabled;
  rejectButton.disabled = disabled;
};

const formatMethod = (method: ApprovalRequestDto['method']): string => {
  return method === 'wallet_sign_transaction' ? 'Подпись транзакции' : 'Подпись сообщения';
};

const renderTransactionPreview = (preview: TransactionApprovalPreview): void => {
  transactionCard.classList.remove('hidden');
  messageCard.classList.add('hidden');

  txVersionEl.textContent = preview.version;
  txFeePayerEl.textContent = preview.feePayer ?? '—';
  txBlockhashEl.textContent = preview.recentBlockhash ?? '—';
  txInstructionCountEl.textContent = String(preview.instructionCount);

  if (preview.transfer) {
    transferBox.classList.remove('hidden');
    transferFromEl.textContent = preview.transfer.from;
    transferToEl.textContent = preview.transfer.to;
    transferAmountEl.textContent = `${preview.transfer.sol} SOL (${preview.transfer.lamports} lamports)`;
  } else {
    transferBox.classList.add('hidden');
  }

  if (preview.warning) {
    txWarningEl.classList.remove('hidden');
    txWarningEl.textContent = preview.warning;
  } else {
    txWarningEl.classList.add('hidden');
    txWarningEl.textContent = '';
  }

  if (preview.instructions.length === 0) {
    detailsEl.textContent = 'Инструкции не найдены или не удалось распарсить payload.';
    return;
  }

  const lines = preview.instructions.map((instruction, index) => {
    const accounts = instruction.accounts.join(', ');
    return [
      `#${index + 1}`,
      `programId: ${instruction.programId}`,
      `accounts: ${accounts}`,
      `data(base64): ${instruction.dataBase64}`
    ].join('\n');
  });
  detailsEl.textContent = lines.join('\n\n');
};

const renderMessagePreview = (preview: MessageApprovalPreview): void => {
  transactionCard.classList.add('hidden');
  messageCard.classList.remove('hidden');

  msgLengthEl.textContent = `${preview.messageLength} bytes`;
  msgUtf8El.textContent = preview.utf8Preview;
  msgBase64El.textContent = preview.base64Preview;
  detailsEl.textContent = `Message length: ${preview.messageLength} bytes`;
};

const renderRequest = (request: ApprovalRequestDto): void => {
  originEl.textContent = request.origin;
  methodEl.textContent = formatMethod(request.method);
  accountEl.textContent = request.publicKey;

  const date = new Date(request.createdAt).toLocaleString();
  statusEl.textContent = `Запрос от dApp. Создан: ${date}`;

  if (request.preview.kind === 'transaction') {
    renderTransactionPreview(request.preview);
    return;
  }

  renderMessagePreview(request.preview);
};

const loadRequest = async (): Promise<void> => {
  if (!requestId) {
    statusEl.textContent = 'Некорректный запрос: не найден requestId.';
    setButtonsDisabled(true);
    return;
  }

  try {
    const response = (await browser.runtime.sendMessage({
      method: 'approval_get_request',
      requestId
    })) as ApprovalGetResponse;

    if (!response.request) {
      statusEl.textContent = 'Запрос уже обработан или недоступен.';
      setButtonsDisabled(true);
      return;
    }

    renderRequest(response.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось загрузить запрос.';
    statusEl.textContent = message;
    setButtonsDisabled(true);
  }
};

const sendDecision = async (approved: boolean): Promise<void> => {
  if (!requestId) {
    return;
  }

  setButtonsDisabled(true);
  statusEl.textContent = approved ? 'Подтверждение...' : 'Отклонение...';

  try {
    await browser.runtime.sendMessage({
      method: 'approval_respond',
      requestId,
      approved
    });

    const resultText = approved ? 'Подпись подтверждена.' : 'Подпись отклонена.';
    statusEl.textContent = resultText;
    window.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить решение.';
    statusEl.textContent = message;
    setButtonsDisabled(false);
  }
};

approveButton.addEventListener('click', () => {
  void sendDecision(true);
});

rejectButton.addEventListener('click', () => {
  void sendDecision(false);
});

void loadRequest();
