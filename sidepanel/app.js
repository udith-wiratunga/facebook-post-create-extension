// ── Language → Country mapping ──────────────────────────────────────
const LANG_COUNTRY_MAP = {
  English:    ['United Kingdom', 'United States', 'Australia', 'New Zealand', 'Canada'],
  German:     ['Germany', 'Austria', 'Switzerland'],
  Italian:    ['Italy'],
  French:     ['France', 'Belgium', 'Switzerland'],
  Spanish:    ['Spain'],
  Swedish:    ['Sweden'],
  Danish:     ['Denmark'],
  Dutch:      ['Netherlands', 'Belgium'],
  Portuguese: ['Portugal', 'Brazil'],
  Norwegian:  ['Norway'],
  Finnish:    ['Finland']
};

// ── Defaults ────────────────────────────────────────────────────────
const DEFAULTS = {
  imageRatio: '3:4',
  language:   'English',
  country:    'United Kingdom',
  sourceType: 'url'
};

// ── State ───────────────────────────────────────────────────────────
let state = { ...DEFAULTS };
let uploadedImage = null; // { base64, mimeType, name }

// ── DOM refs ────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

let el = {};

// ── Initialise ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  await loadSettings();
  bindEvents();
  renderUI();
});

function cacheElements() {
  el = {
    imageRatio:       $('imageRatio'),
    language:         $('language'),
    country:          $('country'),
    sourceUrl:        $('sourceUrl'),
    sourceText:       $('sourceText'),
    urlGroup:         $('urlGroup'),
    textGroup:        $('textGroup'),
    urlInput:         $('urlInput'),
    textInput:        $('textInput'),
    charCount:        $('charCount'),
    imageUpload:      $('imageUpload'),
    imageInput:       $('imageInput'),
    uploadPlaceholder:$('uploadPlaceholder'),
    imagePreview:     $('imagePreview'),
    previewImg:       $('previewImg'),
    removeImage:      $('removeImage'),
    generateBtn:      $('generateBtn'),
    status:           $('status')
  };
}

// ── Settings persistence ────────────────────────────────────────────
async function loadSettings() {
  const saved = await chrome.storage.local.get([
    'imageRatio', 'language', 'country', 'sourceType'
  ]);
  if (saved.imageRatio)  state.imageRatio  = saved.imageRatio;
  if (saved.language)    state.language    = saved.language;
  if (saved.country)     state.country     = saved.country;
  if (saved.sourceType)  state.sourceType  = saved.sourceType;
}

function saveSettings() {
  chrome.storage.local.set({
    imageRatio: state.imageRatio,
    language:   state.language,
    country:    state.country,
    sourceType: state.sourceType
  });
}

// ── Render ──────────────────────────────────────────────────────────
function renderUI() {
  el.imageRatio.value = state.imageRatio;
  el.language.value   = state.language;
  populateCountries();

  if (state.sourceType === 'url') {
    el.sourceUrl.checked  = true;
    el.urlGroup.style.display  = 'block';
    el.textGroup.style.display = 'none';
  } else {
    el.sourceText.checked = true;
    el.urlGroup.style.display  = 'none';
    el.textGroup.style.display = 'block';
  }
}

function populateCountries() {
  const countries = LANG_COUNTRY_MAP[state.language] || ['Unknown'];
  el.country.innerHTML = '';
  countries.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    el.country.appendChild(opt);
  });
  // Keep previously-saved country if it still applies
  if (countries.includes(state.country)) {
    el.country.value = state.country;
  } else {
    state.country = countries[0];
    el.country.value = countries[0];
  }
}

// ── Event bindings ──────────────────────────────────────────────────
function bindEvents() {
  // Settings
  el.imageRatio.addEventListener('change', (e) => {
    state.imageRatio = e.target.value;
    saveSettings();
  });

  el.language.addEventListener('change', (e) => {
    state.language = e.target.value;
    populateCountries();
    saveSettings();
  });

  el.country.addEventListener('change', (e) => {
    state.country = e.target.value;
    saveSettings();
  });

  // Source type toggle
  el.sourceUrl.addEventListener('change', () => {
    state.sourceType = 'url';
    el.urlGroup.style.display  = 'block';
    el.textGroup.style.display = 'none';
    saveSettings();
  });

  el.sourceText.addEventListener('change', () => {
    state.sourceType = 'text';
    el.urlGroup.style.display  = 'none';
    el.textGroup.style.display = 'block';
    saveSettings();
  });

  // Character counter
  el.textInput.addEventListener('input', (e) => {
    const len = e.target.value.length;
    el.charCount.textContent = `${len}/1000`;
    el.charCount.classList.toggle('over-limit', len > 1000);
  });

  // Image upload — click
  el.imageUpload.addEventListener('click', (e) => {
    if (e.target === el.removeImage || el.removeImage.contains(e.target)) return;
    el.imageInput.click();
  });

  el.imageInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleImageFile(e.target.files[0]);
  });

  // Image upload — drag & drop
  el.imageUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.imageUpload.classList.add('drag-over');
  });
  el.imageUpload.addEventListener('dragleave', () => {
    el.imageUpload.classList.remove('drag-over');
  });
  el.imageUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    el.imageUpload.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
  });

  // Image upload — paste anywhere in the panel
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        handleImageFile(item.getAsFile());
        break;
      }
    }
  });

  // Remove image
  el.removeImage.addEventListener('click', (e) => {
    e.stopPropagation();
    clearImage();
  });

  // Generate
  el.generateBtn.addEventListener('click', handleGenerate);
}

// ── Image handling ──────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showStatus('Please upload a valid image file.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    uploadedImage = {
      base64:   dataUrl.split(',')[1],
      mimeType: file.type,
      name:     file.name
    };
    el.previewImg.src = dataUrl;
    el.imagePreview.style.display      = 'flex';
    el.uploadPlaceholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  uploadedImage = null;
  el.imagePreview.style.display      = 'none';
  el.uploadPlaceholder.style.display = 'flex';
  el.imageInput.value = '';
}

function clearInputs() {
  // Clear source fields
  el.urlInput.value  = '';
  el.textInput.value = '';
  el.charCount.textContent = '0/1000';
  el.charCount.classList.remove('over-limit');

  // Clear image
  clearImage();
}

// ── Prompt builders ─────────────────────────────────────────────────
function buildPrompt() {
  return state.sourceType === 'url' ? buildUrlPrompt() : buildTextPrompt();
}

function buildUrlPrompt() {
  const url = el.urlInput.value.trim();
  if (!url) return null;

  let p = `Create a high-impact news-style social media image in ${state.imageRatio} vertical resolution, similar to a tabloid / news post in ${state.language}.\n\n`;

  if (uploadedImage) {
    p += `Use uploaded image if you need.\n\n`;
  }

  p += `After generating the image, be sure to suggest a highly engaging viral Facebook captions\n\n`;

  p += `Source: Use the information from this article:\n`;
  p += `👉 ${url}\n\n`;

  p += `Visual Style Guidelines:\n\n`;
  p += `Dramatic, attention-grabbing, professional news look\n\n`;
  p += `Strong contrast, sharp focus, slightly cinematic lighting\n\n`;
  p += `Serious or tense mood (not cartoonish)\n\n`;
  p += `Use bold typography similar to major tabloids or news portals\n\n`;

  p += `Headline Rules:\n\n`;
  p += `Short, bold, emotionally charged\n\n`;
  p += `Should trigger curiosity or mild outrage\n\n`;
  p += `Must NOT be misleading\n\n`;
  p += `Use 1–2 lines max\n\n`;
  p += `Highlight the main controversy, criticism, or shocking angle\n\n`;

  p += `Sub-headline (optional):\n\n`;
  p += `Adds context or clarifies the situation in a neutral journalistic tone\n\n`;

  p += `Text Layout:\n\n`;
  p += `Headline in large bold font\n\n`;
  p += `Key words highlighted (yellow / white / red tones)\n\n`;
  p += `Clean hierarchy: headline → sub-headline → source feel\n\n`;

  p += `Images:\n\n`;
  p += `Use a relevant public figure image if appropriate\n\n`;
  p += `If multiple people are involved, place them side-by-side\n\n`;
  p += `Background should feel official (flags, press room, podium, formal setting)\n\n`;
  p += `Realistic photojournalism\n\n`;
  p += `Viral social media news post\n\n`;
  p += `Clean, modern, high contrast\n\n`;

  p += `Strict restrictions:\n\n`;
  p += `No hashtags\n\n`;
  p += `No website URLs\n\n`;
  p += `No logos or watermarks\n\n`;
  p += `No extra paragraphs or captions\n\n`;

  p += `Overall Goal:\n`;
  p += `Create a scroll-stopping news image suitable for Facebook, matching the tone of professional political or news media.\n\n`;
  p += `Emphasize controversy, criticism, or public reaction, while keeping the wording factual and responsible.`;

  return p;
}

function buildTextPrompt() {
  const text = el.textInput.value.trim();
  if (!text) return null;

  let p = `Create a high-impact news-style social media image in ${state.imageRatio} vertical resolution, similar to a tabloid or post.\n\n`;

  p += `Topic: ${text}\n\n`;
  p += `Country/Context: ${state.country}\n\n`;

  if (uploadedImage) {
    p += `Use uploaded image if you need.\n\n`;
  }

  p += `Design requirements:\n\n`;
  p += `Bold, large headline text that is short, emotional, and easy to read\n\n`;
  p += `Headline should be uppercase and attention-grabbing\n\n`;
  p += `Add a small category tag at the top (e.g. ECONOMY, POLITICS, BREAKING, WORLD)\n\n`;
  p += `Background image should visually represent the news (realistic photo style)\n\n`;
  p += `If people are shown, they should look concerned / shocked / emotional depending on the topic\n\n`;
  p += `Use dramatic lighting and a serious news mood\n\n`;
  p += `Slight depth-of-field blur for professional editorial look\n\n`;

  p += `Text rules:\n\n`;
  p += `Keep text very short (headline only, optional small sub-line)\n\n`;
  p += `Do NOT add hashtags\n\n`;
  p += `Do NOT add website URLs\n\n`;
  p += `Do NOT add logos or watermarks\n\n`;

  p += `Style:\n\n`;
  p += `Realistic photojournalism\n\n`;
  p += `Viral social media news post\n\n`;
  p += `Clean, modern, high contrast\n\n`;

  p += `Language: ${state.language}\n\n`;

  p += `Headline should trigger curiosity and mild outrage without being misleading.\n\n`;
  p += `After generating the image, be sure to suggest a highly engaging viral Facebook caption.`;

  return p;
}

// ── Generate action ─────────────────────────────────────────────────
async function handleGenerate() {
  // Validate inputs
  if (state.sourceType === 'url' && !el.urlInput.value.trim()) {
    showStatus('Please enter a URL.', 'error');
    return;
  }
  if (state.sourceType === 'text' && !el.textInput.value.trim()) {
    showStatus('Please enter text content.', 'error');
    return;
  }
  if (state.sourceType === 'text' && el.textInput.value.length > 1000) {
    showStatus('Text exceeds 1000 character limit.', 'error');
    return;
  }

  const prompt = buildPrompt();
  if (!prompt) {
    showStatus('Could not build prompt. Check your inputs.', 'error');
    return;
  }

  el.generateBtn.disabled   = true;
  el.generateBtn.textContent = 'Sending...';
  showStatus('Sending prompt...', 'info');

  try {
    // Find the active ChatGPT tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    const url = tab?.url || '';
    const isSupported =
      url.includes('chatgpt.com') ||
      url.includes('chat.openai.com') ||
      url.includes('gemini.google.com');

    if (!tab || !isSupported) {
      showStatus('Please open ChatGPT or Gemini in the active tab.', 'error', prompt);
      return;
    }

    // Make sure the content script is injected
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await delay(500);
    }

    // Send data to the content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GENERATE_PROMPT',
      data: { prompt, image: uploadedImage }
    });

    if (response?.success) {
      clearInputs();
      const target = url.includes('gemini.google.com') ? 'Gemini' : 'ChatGPT';
      showStatus(`Prompt inserted into ${target}! Review and press Send.`, 'success');
    } else {
      showStatus(
        response?.error || 'Failed to insert prompt.',
        'error',
        prompt
      );
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error', prompt);
  } finally {
    el.generateBtn.disabled   = false;
    el.generateBtn.textContent = 'Generate';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showStatus(message, type, promptToCopy = null) {
  el.status.innerHTML   = '';
  el.status.textContent = message;
  el.status.className   = `status ${type}`;
  el.status.style.display = 'block';

  if (promptToCopy) {
    const btn = document.createElement('button');
    btn.textContent = 'Copy Prompt to Clipboard';
    btn.className   = 'copy-btn';
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(promptToCopy);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Prompt to Clipboard'; }, 2000);
    });
    el.status.appendChild(document.createElement('br'));
    el.status.appendChild(btn);
  }

  if (type === 'success') {
    setTimeout(() => { el.status.style.display = 'none'; }, 5000);
  }
}
