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
  const { prompt, image } = data;

  // Upload image first (if provided)
  if (image) {
    const ok = await uploadImage(image);
    if (ok) await sleep(1500); // let ChatGPT process the attachment
  }

  // Inject prompt text
  const injected = await injectPrompt(prompt);
  if (!injected) {
    return {
      success: false,
      error: 'Could not find ChatGPT input field. Make sure ChatGPT is fully loaded.'
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
    // ContentEditable (ProseMirror) – the current ChatGPT editor
    textarea.focus();

    // Select all existing content & delete
    const sel = window.getSelection();
    sel.selectAllChildren(textarea);
    document.execCommand('delete', false, null);
    await sleep(50);

    // Insert line-by-line so paragraph structure is preserved
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) document.execCommand('insertParagraph', false, null);
      if (lines[i].length > 0) {
        document.execCommand('insertText', false, lines[i]);
      }
    }

    // Fire events so React / ProseMirror picks up the change
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return true;
}

// ── Image upload ────────────────────────────────────────────────────
async function uploadImage(imageData) {
  const file = base64ToFile(imageData);

  // Method 1 — find an existing <input type="file">
  let fileInput = document.querySelector('input[type="file"]');

  // Method 2 — click the attachment button so the input appears
  if (!fileInput) {
    const attachBtn =
      document.querySelector('[aria-label="Attach files"]') ||
      document.querySelector('button[aria-label*="ttach"]') ||
      document.querySelector('[data-testid="attachment-button"]') ||
      document.querySelector('button[aria-label*="pload"]');
    if (attachBtn) {
      attachBtn.click();
      await sleep(600);
      fileInput = document.querySelector('input[type="file"]');
    }
  }

  if (fileInput) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Method 3 — simulate a paste event on the editor
  const textarea = findTextarea();
  if (textarea) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
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
      const dt = new DataTransfer();
      dt.items.add(file);
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

// ── Helpers ─────────────────────────────────────────────────────────
function findTextarea() {
  const selectors = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'div[contenteditable="true"].ProseMirror',
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
