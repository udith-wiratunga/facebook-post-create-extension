// ── Message listener ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true });
    return;
  }

  if (message.type === 'GENERATE_PROMPT') {
    handleGenerate(message.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async
  }
});

// ── Main handler ────────────────────────────────────────────────────
async function handleGenerate(data) {
  const { prompt } = data;
  const images = data.images || (data.image ? [data.image] : []);

  // Upload images first (if provided)
  if (images.length) {
    const ok = await uploadImages(images);
    if (ok) await sleep(1000 + 500 * images.length); // let the site process the attachments
  }

  // Inject prompt text
  const injected = await injectPrompt(prompt);
  if (!injected) {
    return {
      success: false,
      error: 'Could not find the chat input field. Make sure ChatGPT, Gemini, or Meta AI is fully loaded.'
    };
  }

  return { success: true };
}

// ── Text injection ──────────────────────────────────────────────────
async function injectPrompt(text) {
  const textarea = findTextarea();
  if (!textarea) return false;

  textarea.focus();
  await sleep(100);

  if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
    // Standard <textarea>
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // ContentEditable (ProseMirror / Lexical / Quill)
    textarea.focus();
    await sleep(50);

    // Primary: selectAll → delete → insertText
    // ProseMirror listens for execCommand natively and updates its internal
    // document model correctly — this is the only reliable method
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(50);
    const inserted = document.execCommand('insertText', false, text);
    if (inserted) return true;

    // Fallback 1: clipboard paste simulation
    const sel = window.getSelection();
    sel.selectAllChildren(textarea);
    await sleep(30);
    if (injectViaPaste(textarea, text)) return true;

    // Fallback 2: line-by-line execCommand
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(50);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) document.execCommand('insertParagraph', false, null);
      if (lines[i].length > 0) document.execCommand('insertText', false, lines[i]);
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return true;
}

// Simulate a paste event carrying plain text — works with ProseMirror, Lexical, and Quill
function injectViaPaste(el, text) {
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));
    return true;
  } catch {
    return false;
  }
}

// ── Image upload ────────────────────────────────────────────────────
function filesToDataTransfer(files) {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt;
}

async function uploadImages(imageDataList) {
  const files = imageDataList.map(base64ToFile);

  const isChatGPT = /chatgpt\.com|chat\.openai\.com/.test(location.hostname);
  if (isChatGPT) return uploadImagesChatGPT(files);

  // Method 1 — find an existing <input type="file"> (prefer one that accepts several files)
  let fileInput =
    document.querySelector('input[type="file"][multiple]') ||
    document.querySelector('input[type="file"]');

  // Method 2 — click the attachment button so the input appears
  if (!fileInput) {
    const attachBtn =
      document.querySelector('[aria-label="Attach files"]') ||
      document.querySelector('button[aria-label*="ttach"]') ||
      document.querySelector('[data-testid="attachment-button"]') ||
      document.querySelector('button[aria-label*="pload"]') ||
      // Gemini — "Add files" / "+" menu trigger
      document.querySelector('button[aria-label*="Add files"]') ||
      document.querySelector('button[aria-label*="Upload file"]') ||
      document.querySelector('uploader button') ||
      // Meta.ai — image/media button
      document.querySelector('button[aria-label*="mage"]') ||
      document.querySelector('button[aria-label*="edia"]') ||
      document.querySelector('[data-testid="media-attachment-button"]');
    if (attachBtn) {
      attachBtn.click();
      await sleep(600);
      fileInput =
        document.querySelector('input[type="file"][multiple]') ||
        document.querySelector('input[type="file"]');
    }
  }

  if (fileInput) {
    const dt = filesToDataTransfer(files);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Method 3 — simulate a paste event on the editor
  const textarea = findTextarea();
  if (textarea) {
    try {
      const dt = filesToDataTransfer(files);
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      textarea.dispatchEvent(pasteEvt);
      return true;
    } catch {
      // fall through
    }
  }

  // Method 4 — simulate drag-and-drop
  if (textarea) {
    try {
      const dt = filesToDataTransfer(files);
      textarea.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
      textarea.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer: dt }));
      textarea.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer: dt }));
      return true;
    } catch {
      // fall through
    }
  }

  return false;
}

// ChatGPT: the page has several <input type="file"> elements, so picking the
// first one often targets the wrong uploader. Paste into the composer first
// (ChatGPT handles pasted images natively), verify an attachment appeared,
// then fall back to an image-accepting file input, then drag-and-drop.
async function uploadImagesChatGPT(files) {
  const editor = findTextarea();
  const before = countAttachments();

  // 1 — paste into the composer
  if (editor) {
    editor.focus();
    await sleep(100);
    try {
      const dt = filesToDataTransfer(files);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt
      }));
    } catch { /* ignore */ }
    if (await waitForAttachment(before)) return true;
  }

  // 2 — image-accepting file input
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  const input =
    inputs.find(i => i.multiple && /image/.test(i.accept || '')) ||
    inputs.find(i => /image/.test(i.accept || '')) ||
    inputs.find(i => !i.accept || i.accept.includes('*')) ||
    inputs[0];
  if (input) {
    const dt = filesToDataTransfer(files);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (await waitForAttachment(before)) return true;
  }

  // 3 — drag-and-drop onto the composer
  const target = editor?.closest('form') || editor;
  if (target) {
    const dt = filesToDataTransfer(files);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    if (await waitForAttachment(before)) return true;
  }

  return false;
}

function countAttachments() {
  return document.querySelectorAll(
    'img[src^="blob:"], [data-testid*="attachment"], [aria-label*="Remove file"], [aria-label*="Remove image"]'
  ).length;
}

async function waitForAttachment(before, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (countAttachments() > before) return true;
    await sleep(150);
  }
  return false;
}

// ── Helpers ─────────────────────────────────────────────────────────
function findTextarea() {
  const isGemini = location.hostname.includes('gemini.google.com');
  const isMeta   = location.hostname.includes('meta.ai');

  const selectors = isGemini
    ? [
        // Gemini uses a custom <rich-textarea> wrapping a Quill .ql-editor
        'rich-textarea .ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea'
      ]
    : isMeta
    ? [
        // Meta.ai uses the Lexical editor (Meta's own open-source editor)
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[aria-label="Message Meta AI"][contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea'
      ]
    : [
        // Nov 2026 ChatGPT — Lexical editor inside data-composer-editor-host
        '[data-composer-editor-host] .ProseMirror[contenteditable="true"]',
        '[data-composer-editor-host] [contenteditable="true"]',
        // Sep 2026 ChatGPT — scoped to composer form (avoids transcript editors)
        'form[data-chatgpt-composer] .ProseMirror[contenteditable="true"]',
        'form[data-chatgpt-composer] [contenteditable="true"]',
        // Other 2026 composer attributes
        '[contenteditable="true"][data-composer-markdown]',
        '[contenteditable="true"][aria-label="Ask ChatGPT"]',
        '.ProseMirror[contenteditable="true"]',
        // Plain textarea variant (mobile/simplified ChatGPT build)
        'textarea[name="prompt"]',
        '#mobile-composer-prompt',
        // Legacy selectors (older builds)
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        // Generic fallback
        'div[contenteditable="true"]',
        'textarea'
      ];

  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

function base64ToFile({ base64, mimeType, name }) {
  const bytes = atob(base64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mimeType });
  return new File([blob], name || 'image.png', { type: mimeType });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
