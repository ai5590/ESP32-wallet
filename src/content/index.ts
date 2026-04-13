import browser from 'webextension-polyfill';
import {
  BRIDGE_CHANNEL,
  BRIDGE_DIRECTION_REQUEST,
  BRIDGE_DIRECTION_RESPONSE
} from '../shared/constants';
import type { BridgeRequestEnvelope, BridgeResponseEnvelope } from '../types/messages';
import { isBridgeRequest } from '../types/messages';

const injectProviderScript = (): void => {
  const injectedScriptId = 'esp-wallet-provider-script';
  if (document.getElementById(injectedScriptId)) {
    return;
  }

  const script = document.createElement('script');
  script.id = injectedScriptId;
  script.src = browser.runtime.getURL('injected.js');
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => {
    script.remove();
  };
};

const postResponse = (response: BridgeResponseEnvelope): void => {
  window.postMessage(response, '*');
};

const handleBridgeRequest = async (request: BridgeRequestEnvelope): Promise<void> => {
  try {
    const result = await browser.runtime.sendMessage({
      method: request.method,
      params: request.params,
      origin: window.location.origin
    });

    postResponse({
      channel: BRIDGE_CHANNEL,
      direction: BRIDGE_DIRECTION_RESPONSE,
      id: request.id,
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extension error.';
    postResponse({
      channel: BRIDGE_CHANNEL,
      direction: BRIDGE_DIRECTION_RESPONSE,
      id: request.id,
      error: { message }
    });
  }
};

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window) {
    return;
  }

  if (!isBridgeRequest(event.data)) {
    return;
  }

  const request = event.data;
  if (request.channel !== BRIDGE_CHANNEL || request.direction !== BRIDGE_DIRECTION_REQUEST) {
    return;
  }

  void handleBridgeRequest(request);
});

injectProviderScript();
