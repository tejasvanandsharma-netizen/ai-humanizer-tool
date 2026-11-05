// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Clear buttons
document.querySelectorAll('.clear-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.clear).value = '';
    updateCount(btn.dataset.clear);
  });
});

// Word counter
function updateCount(id) {
  const text = document.getElementById(id).value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  document.getElementById(id === 'detect-input' ? 'detect-count' : 'humanize-count')
    .textContent = `${words} words`;
}
['detect-input', 'humanize-input'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => updateCount(id));
});

// Show loading
function showLoading(el, msg) {
  el.innerHTML = `<div class="loading"><div class="spinner"></div>${msg}</div>`;
}

// Show error
function showError(el, msg) {
  el.innerHTML = `<p style="color:#f87171;">❌ ${msg}</p>`;
}

// ---------- DETECTOR ----------
document.getElementById('detect-btn').addEventListener('click', async () => {
  const text = document.getElementById('detect-input').value.trim();
  const resultEl = document.getElementById('detect-result');
  const btn = document.getElementById('detect-btn');

  if (text.split(/\s+/).length < 30) {
    showError(resultEl, 'Please enter at least 30 words for accurate detection.');
    return;
  }

  btn.disabled = true;
  showLoading(resultEl, 'Analyzing text...');

  try {
    const res = await fetch('/.netlify/functions/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'detect', text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    renderDetection(resultEl, data);
  } catch (err) {
    showError(resultEl, err.message);
  } finally {
    btn.disabled = false;
  }
});

function renderDetection(el, data) {
  const prob = data.ai_probability;
  const color = prob > 60 ? '#dc2626' : prob > 30 ? '#eab308' : '#16a34a';
  const verdictClass =
    data.verdict === 'likely_ai' ? 'verdict-ai' :
    data.verdict === 'likely_human' ? 'verdict-human' : 'verdict-mixed';
  const verdictText =
    data.verdict === 'likely_ai' ? '🤖 Likely AI-Generated' :
    data.verdict === 'likely_human' ? '👤 Likely Human-Written' : '⚠️ Mixed / Uncertain';

  el.innerHTML = `
    <span class="verdict-badge ${verdictClass}">${verdictText}</span>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:14px;">
      <span>AI Probability</span>
      <strong style="color:${color}">${prob}%</strong>
    </div>
    <div class="score-bar">
      <div class="score-fill" style="width:${prob}%;background:${color};"></div>
    </div>
    <p style="margin-top:14px;font-size:14px;color:#a1a1aa;">${data.reasoning}</p>
    ${data.signals?.length ? `
      <div style="margin-top:14px;">
        <strong style="font-size:13px;">Signals detected:</strong>
        <ul style="margin-top:6px;padding-left:18px;font-size:13px;color:#a1a1aa;">
          ${data.signals.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>` : ''}
  `;
}

// ---------- HUMANIZER ----------
document.getElementById('humanize-btn').addEventListener('click', async () => {
  const text = document.getElementById('humanize-input').value.trim();
  const resultEl = document.getElementById('humanize-result');
  const btn = document.getElementById('humanize-btn');

  if (text.length < 20) {
    showError(resultEl, 'Please enter at least 20 characters.');
    return;
  }

  btn.disabled = true;
  showLoading(resultEl, 'Humanizing text...');

  try {
    const res = await fetch('/.netlify/functions/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'humanize', text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    resultEl.innerHTML = `
      <strong style="font-size:14px;">✨ Humanized version:</strong>
      <div class="output-box" id="humanized-output">${escapeHtml(data.result)}</div>
      <button class="copy-btn" onclick="copyOutput()">📋 Copy</button>
    `;
    window._lastHumanized = data.result;
  } catch (err) {
    showError(resultEl, err.message);
  } finally {
    btn.disabled = false;
  }
});

function copyOutput() {
  navigator.clipboard.writeText(window._lastHumanized || '');
  event.target.textContent = '✅ Copied!';
  setTimeout(() => event.target.textContent = '📋 Copy', 1500);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}