// ==========================================
// THE VIS WALKTHROUGH LIBRARY — ELEGANT INSPECTOR UI
// ==========================================

function getViewRegions() {
    const views = [];
    const groups = document.querySelectorAll("svg > g");
    groups.forEach(g => {
        try {
            const box = g.getBBox();
            views.push({ element: g, x: box.x, y: box.y, width: box.width, height: box.height });
        } catch (e) { }
    });
    return views;
}

function validateViewSelector(selector, layoutViews) {
    const element = document.querySelector(selector);
    if (!element) return false;
    const box = element.getBBox();
    for (const view of layoutViews) {
        const overlap = box.x >= view.x && box.y >= view.y &&
            box.x + box.width <= view.x + view.width &&
            box.y + box.height <= view.y + view.height;
        if (overlap) return true;
    }
    return false;
}

function validateSelector(selector, viewSelector) {
    const element = document.querySelector(selector);
    if (!element) return false;
    const viewContainer = document.querySelector(viewSelector);
    if (!viewContainer || !viewContainer.contains(element)) return false;
    try {
        const elementBox = element.getBBox();
        const viewBox = viewContainer.getBBox();
        return elementBox.x >= viewBox.x && elementBox.y >= viewBox.y &&
            elementBox.x + elementBox.width <= viewBox.x + viewBox.width &&
            elementBox.y + elementBox.height <= viewBox.y + viewBox.height;
    } catch (err) { return false; }
}

function selectBestCandidate(component, layoutViews) {
    if (!component.view || !component.view.candidates || component.view.candidates.length === 0) {
        return component.encoding?.candidates?.[0]?.selector || null;
    }
    const viewSelector = component.view.candidates[0].selector;
    validateViewSelector(viewSelector, layoutViews);
    const allCandidates = [
        ...(component.encoding?.candidates || []),
        ...(component.interaction?.candidates || [])
    ];
    for (const candidate of allCandidates) {
        if (validateSelector(candidate.selector, viewSelector, layoutViews)) return candidate.selector;
    }
    return allCandidates[0]?.selector || viewSelector;
}

// ─────────────────────────────────────────────────────────────
//  SPOTLIGHT HELPER
// ─────────────────────────────────────────────────────────────

function removeSpotlight() {
    const el = document.getElementById(SPOTLIGHT_ID);
    if (el) el.remove();
    if (window._vwSpotlightResizer) {
        window.removeEventListener('resize', window._vwSpotlightResizer);
        window._vwSpotlightResizer = null;
    }
}

function _svgBBoxToPageRect(svgEl, bbox) {
    const svgRect = svgEl.getBoundingClientRect();
    const vb = svgEl.viewBox?.baseVal;
    const scaleX = vb && vb.width ? svgRect.width / vb.width : 1;
    const scaleY = vb && vb.height ? svgRect.height / vb.height : 1;
    const originX = svgRect.left + window.scrollX - (vb ? vb.x * scaleX : 0);
    const originY = svgRect.top + window.scrollY - (vb ? vb.y * scaleY : 0);
    return {
        x: originX + bbox.x * scaleX,
        y: originY + bbox.y * scaleY,
        w: bbox.width * scaleX,
        h: bbox.height * scaleY,
    };
}

function _getAccumulatedBBox(el, svgEl) {
    try {
        const ctm = el.getCTM();
        const bbox = el.getBBox();
        if (!ctm || !bbox || (bbox.width === 0 && bbox.height === 0)) return null;
        const corners = [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y },
            { x: bbox.x, y: bbox.y + bbox.height },
            { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        ].map(p => ({ x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f }));
        return {
            x: Math.min(...corners.map(c => c.x)),
            y: Math.min(...corners.map(c => c.y)),
            width: Math.max(...corners.map(c => c.x)) - Math.min(...corners.map(c => c.x)),
            height: Math.max(...corners.map(c => c.y)) - Math.min(...corners.map(c => c.y)),
        };
    } catch (e) { return null; }
}

function showSpotlight(selectors) {
    removeSpotlight();
    if (!selectors || selectors.length === 0) return;
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;
    const pageRects = [];
    selectors.forEach(sel => {
        svgEl.querySelectorAll(sel).forEach(el => {
            const bbox = _getAccumulatedBBox(el, svgEl);
            if (!bbox) return;
            const pr = _svgBBoxToPageRect(svgEl, bbox);
            if (pr.w > 0 && pr.h > 0) pageRects.push(pr);
        });
    });
    if (pageRects.length === 0) return;
    const pad = 20;
    const minX = Math.min(...pageRects.map(r => r.x)) - pad;
    const minY = Math.min(...pageRects.map(r => r.y)) - pad;
    const maxX = Math.max(...pageRects.map(r => r.x + r.w)) + pad;
    const maxY = Math.max(...pageRects.map(r => r.y + r.h)) + pad;
    const holeX = minX, holeY = minY, holeW = maxX - minX, holeH = maxY - minY;
    const radius = 12;
    const canvas = document.createElement('canvas');
    canvas.id = SPOTLIGHT_ID;
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        _drawSpotlight(canvas, holeX - window.scrollX, holeY - window.scrollY, holeW, holeH, radius);
    };
    canvas.style.cssText = `position:fixed;top:0;left:0;pointer-events:none;z-index:2147483630;transition:opacity 0.3s ease;opacity:0;`;
    document.body.appendChild(canvas);
    resize();
    requestAnimationFrame(() => requestAnimationFrame(() => { canvas.style.opacity = '1'; }));
    const onScroll = () => _drawSpotlight(canvas, holeX - window.scrollX, holeY - window.scrollY, holeW, holeH, radius);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', resize);
    window._vwSpotlightResizer = resize;
    canvas._vwScrollHandler = onScroll;
    window._vwSpotlightCleanup = () => { window.removeEventListener('scroll', onScroll); };
}

function _drawSpotlight(canvas, holeX, holeY, holeW, holeH, radius) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    _roundedRect(ctx, holeX, holeY, holeW, holeH, radius);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(86, 156, 214, 0.35)';
    ctx.lineWidth = 10;
    ctx.shadowColor = 'rgba(86, 156, 214, 0.6)';
    ctx.shadowBlur = 18;
    _roundedRect(ctx, holeX, holeY, holeW, holeH, radius);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(86, 156, 214, 0.9)';
    ctx.lineWidth = 1.5;
    _roundedRect(ctx, holeX, holeY, holeW, holeH, radius);
    ctx.stroke();
    ctx.restore();
}

function _roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}


// ─────────────────────────────────────────────────────────────
//  MAIN CLASS
// ─────────────────────────────────────────────────────────────
class VisWalkthrough {
    constructor(config) {
        this.steps = config.steps || [];
        this.bitmap = config.bitmap || null;
        this.theme = { primary: '#0e0f14', highlight: '#3b7ef5' };
        this.mode = 'none';
        this.originalNodes = [];
        this.observer = null;
        this.exploreHandler = null;
        this.isAuthorMode = true;
        this.currentContext = null;
        this.chatHistory = [];
        this.apiKey = '';
        this._currentStepIdx = 0;
        this.synth = window.speechSynthesis;
        this.isMuted = false;
        this.currentUtterance = null;
        this.narrationStarted = false;
    }

    init() {
        if (document.getElementById('vw-styles')) return;
        this._injectStyles();
        this._renderToggleBar();
    }

    setMode(newMode) {
        if (this.mode === newMode) return;
        if (this.mode === 'edit') this._saveFromDOM();
        this._teardown();
        this.mode = newMode;
        document.querySelectorAll('.vw-toggle-btn').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`vw-btn-${newMode}`);
        if (btn) btn.classList.add('active');
        if (newMode === 'scrolly') this._initScrolly();
        else if (newMode === 'explore') this._initExplore();
        else if (newMode === 'edit') this._initEditMode();
    }

    // ── DATA GENERALISATION ────────────────────────────────────
    _generalizeData(rawSteps) {
    const merged = new Map();

    // 1. Updated getTitle with strict null checks
    const getTitle = (step) => {
        if (!step || !step.targets) return "Component";

        const rawReason = step.targets.raw?.view?.candidates?.[0]?.reason || 
                         step.targets.raw?.encoding?.candidates?.[0]?.reason;

        if (rawReason) {
            return rawReason
                .toLowerCase()
                .replace(/^(container (group )?for (the )?|view of (the )?|marks that encode )/, '')
                .split(';')[0]
                .trim()
                .replace(/\b\w/g, l => l.toUpperCase());
        }

        return "Visualization Component";
    };

    const categorize = (txt) => {
        if (!txt) return { encoding: "", insight: "", interaction: "" };
        const sentences = txt.replace(/([.?!])\s*(?=[A-Z])/g, "$1|").split("|");
        const b = { encoding: [], insight: [], interaction: [] };
        sentences.forEach(s => {
            const l = s.toLowerCase().trim();
            if (!l) return;
            if (l.match(/(click|hover|drag|load|select|update|use the|pan|zoom|interact|press|move)/)) b.interaction.push(s.trim());
            else if (l.match(/(represent|encode|show|color|glyph|indicate|signifies|blue|red|pink|green|circle|rect|line|link|size|magnitude|gradient|bar)/)) b.encoding.push(s.trim());
            else b.insight.push(s.trim());
        });
        return {
            encoding: b.encoding.join(' ') || "Visual marks represent data points in this section.",
            insight: b.insight.join(' ') || "Observe the patterns and distributions shown here.",
            interaction: b.interaction.join(' ') || "Interact with this component to see more details."
        };
    };

    // 2. Loop with safety check
    rawSteps.forEach(step => {
        if (!step) return; // Skip if step itself is undefined

        // Use resolvedSelector as the unique key for grouping
        let key = step.targets?.resolvedSelector || 'General_Overview';
        
        if (!merged.has(key)) {
            merged.set(key, { 
                step_id: key, 
                title: key === 'General_Overview' ? 'System Dashboard' : getTitle(step), // Pass the whole step
                rawText: '', 
                selector: key 
            });
        }
        merged.get(key).rawText += ' ' + (step.text || "");
    });

    return Array.from(merged.values()).map(e => ({ ...e, content: categorize(e.rawText) }));
}

    // ── EXPLORE MODE ───────────────────────────────────────────
    _initExplore() {
        const steps = this._generalizeData(this.steps);
        let insp = document.getElementById('vw-inspector');
        if (!insp) {
            insp = document.createElement('div');
            insp.id = 'vw-inspector';
            insp.innerHTML = `
        <div id="vw-insp-drag">
          <span class="vw-drag-handle">Component Inspector</span>
          <button id="vw-insp-close" style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;font-size:16px;line-height:1;padding:0;transition:color 0.2s;" onmouseover="this.style.color='rgba(255,255,255,0.7)'" onmouseout="this.style.color='rgba(255,255,255,0.25)'">×</button>
        </div>
        <div class="vw-insp-scroll-area">
          <div id="vw-insp-body"></div>
          <div class="vw-chatbot-branding">
            <div class="vw-ai-sparkle">✦</div>
            <span>Exploration Assistant</span>
          </div>
          <div class="vw-chat-container">
            <div class="vw-chat-messages" id="vw-chat-history">
              <div class="vw-msg bot">Hi. What would you like to know about this visualization?</div>
            </div>
            <div class="vw-chat-input-area">
              <input type="text" id="vw-chat-input" placeholder="Ask about this visualization…" autocomplete="off">
              <button id="vw-chat-send" title="Send">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </div>`;
            document.body.appendChild(insp);
            this._makeDraggable(insp, document.getElementById('vw-insp-drag'));
            document.getElementById('vw-insp-close').onclick = () => insp.classList.remove('visible');
        }

        const input = document.getElementById('vw-chat-input');
        const sendBtn = document.getElementById('vw-chat-send');

        const sendMsg = async () => {
            const txt = input.value.trim();
            if (!txt) return;
            this._addChatMessage('user', txt);
            input.value = '';
            const historyDiv = document.getElementById('vw-chat-history');
            const loadingId = 'loading-' + Date.now();
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'vw-msg bot';
            loadingMsg.id = loadingId;
            loadingMsg.innerHTML = '<span style="opacity:0.5;font-style:italic;">Thinking…</span>';
            historyDiv.appendChild(loadingMsg);
            historyDiv.scrollTop = historyDiv.scrollHeight;
            try {
                const response = await this._fetchChatGPTResponse(txt);
                document.getElementById(loadingId).remove();
                this._addChatMessage('bot', response);
            } catch (error) {
                if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
                this._addChatMessage('bot', "Error: Check your API Key or Console.");
                console.error(error);
            }
        };

        sendBtn.onclick = (e) => { e.preventDefault(); sendMsg(); };
        input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg(); } };

        setTimeout(() => insp.classList.add('visible'), 50);

        const render = (s) => {
        if (!s) return;
        this.currentContext = s;
        const body = document.getElementById('vw-insp-body');
        if (!body) return;
        
        // Ensure we are actually updating the DOM
        body.innerHTML = `
            <div class="vw-insp-title">${s.title}</div>
            <details open class="vw-collapsible-sect">
              <summary><span class="vw-sect-icon">📐</span> Purpose & Encoding</summary>
              <div class="vw-insp-txt">${s.content.encoding}</div>
            </details>
            <details open class="vw-collapsible-sect">
              <summary><span class="vw-sect-icon">🔍</span> What to look for</summary>
              <div class="vw-insp-txt">${s.content.insight}</div>
            </details>
            <details open class="vw-collapsible-sect">
              <summary><span class="vw-sect-icon">🖱️</span> How to interact</summary>
              <div class="vw-insp-txt">${s.content.interaction}</div>
            </details>`;
    };

    const overview = steps.find(s => s.step_id === 'General_Overview') || steps[0];
    render(overview);

    this.exploreHandler = (e) => {
    if (e.target.closest('#vw-inspector') || e.target.closest('#vw-toggle-bar')) return;

    let match = null;
    
    // Get the target and its ancestry once
    const target = e.target;

    for (let step of steps) {
        if (step.selector === 'General_Overview' || !step.selector) continue;

        try {
            // Check if the element or any parent matches the selector
            // We use closest() because the user is hovering the <rect>, 
            // but the selector might be the <g> container.
            if (target.matches(step.selector) || target.closest(step.selector)) {
                match = step;
                break;
            }
        } catch (err) {
            // If the selector is malformed (common with unescaped transform strings),
            // skip it so the script doesn't crash
            continue;
        }
    }

    // Update the UI only if we found a new component
    if (match && match !== this.currentContext) {
        render(match);
        // Visual feedback
        document.querySelectorAll('.vw-ring').forEach(el => el.classList.remove('vw-ring'));
        const highlightEl = target.closest(match.selector) || target;
        highlightEl.classList.add('vw-ring');
    } else if (!match && this.currentContext !== overview) {
        // Fall back to overview if we move to empty space
        render(overview);
        document.querySelectorAll('.vw-ring').forEach(el => el.classList.remove('vw-ring'));
    }
};
    
    document.body.addEventListener('mouseover', this.exploreHandler);
}

    _makeDraggable(el, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                el.style.top = (el.offsetTop - pos2) + "px";
                el.style.left = (el.offsetLeft - pos1) + "px";
                el.style.bottom = 'auto';
            };
        };
    }

    _speak(text) {
        if (this.mode === 'edit') return;
        if (this.isMuted || !this.synth) return;

        // Stop current speech
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // Optional: Select a specific voice if needed
        const voices = this.synth.getVoices();
        if (voices.length > 0) utterance.voice = voices[0];

        this.currentUtterance = utterance;
        this.synth.speak(utterance);
    }

    _addChatMessage(role, text) {
        const history = document.getElementById('vw-chat-history');
        const msg = document.createElement('div');
        msg.className = `vw-msg ${role}`;
        msg.innerText = text;
        history.appendChild(msg);
        history.scrollTop = history.scrollHeight;
    }

    async _fetchChatGPTResponse(txt) {
        if (!this.apiKey || this.apiKey.includes('YOUR_OPENAI')) return "Please configure your OpenAI API Key first.";
        let userQuestion = [{ type: "text", text: txt }];
        const contextData = JSON.stringify(this.steps.map(s => ({ component: s.step_id, description: s.text, visual_targets: s.targets })));
        const currentFocus = this.currentContext ? this.currentContext.title : "the general overview";
        const currentDetails = this.currentContext ? JSON.stringify(this.currentContext.content) : "";
        if (this.bitmap) userQuestion.push({ type: "image_url", image_url: { url: `data:image/png;base64,${this.bitmap}` } });
        const messages = [
            { role: "system", content: `You are an expert data visualization assistant for 'DiffSeer'.\n\nReference data:\n${contextData}\n\nUser is viewing: ${currentFocus}.\nDetails: ${currentDetails}\n\nAnswer strictly based on reference data and visualization image. Keep answers under 50 words.` },
            { role: "user", content: userQuestion }
        ];
        const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: "gpt-4o", messages }) });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content.trim();
    }

    // ── STYLES ─────────────────────────────────────────────────
    _injectStyles() {
        const style = document.createElement('style');
        style.id = 'vw-styles';
        style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

      /* ── Toggle bar ── */
      #vw-toggle-bar {
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        display: flex; align-items: center;
        background: rgba(14,15,20,0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 5px 6px;
        border-radius: 32px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.07);
        z-index: 2147483647;
        font-family: 'DM Sans', sans-serif;
        gap: 2px;
      }
      .vw-toggle-btn {
        padding: 8px 18px; border: none; background: transparent;
        color: rgba(255,255,255,0.4); font-weight: 500; font-size: 13px;
        cursor: pointer; border-radius: 26px;
        transition: all 0.25s cubic-bezier(0.16,1,0.3,1); outline: none;
        letter-spacing: -0.01em;
        font-family: 'DM Sans', sans-serif;
      }
      .vw-toggle-btn.active {
        background: rgba(59,126,245,0.9);
        color: white;
        box-shadow: 0 2px 12px rgba(59,126,245,0.45);
      }
      .vw-toggle-btn:hover:not(.active) { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }
      .vw-toggle-divider { width:1px; height:18px; background:rgba(255,255,255,0.1); margin: 0 4px; }
      .vw-action-btn { width:90%; margin:10px auto; display:block; padding:10px; background:#27ae60; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; }

      /* ── Scrolly layout ── */
      body.vw-scrolly-active { overflow:hidden !important; }
      #vw-left  { position:fixed; top:0; left:0; width:calc(100% - 320px); height:100vh; overflow:auto; background:white; z-index:2147483640; }
      #vw-right { position:fixed; top:0; right:0; width:320px; height:100vh; overflow-y:scroll; background:#fcfcfc; border-left:1px solid #eee; z-index:2147483641; display:flex; flex-direction:column; }
      #vw-scale { transform-origin:top left; transition:transform 0.3s ease; padding:20px; }

      /* ── Breadcrumb bar ── */
      #vw-breadcrumb { position:sticky; top:0; z-index:10; background:rgba(252,252,252,0.97); backdrop-filter:blur(6px); border-bottom:1px solid #e8e8e8; padding:10px 14px 8px; font-family:'DM Mono',monospace; font-size:11px; flex-shrink:0; }
      #vw-breadcrumb .vw-bc-label { color:#999; letter-spacing:.06em; text-transform:uppercase; margin-bottom:6px; }
      #vw-breadcrumb .vw-bc-track { display:flex; align-items:center; gap:3px; flex-wrap:wrap; }
      .vw-bc-dot { width:8px; height:8px; border-radius:50%; background:#ddd; transition:all 0.3s; cursor:default; flex-shrink:0; }
      .vw-bc-dot.done    { background:#7fba8a; }
      .vw-bc-dot.current { background:#3b7ef5; width:22px; border-radius:4px; box-shadow:0 0 0 3px rgba(59,126,245,0.2); }
      .vw-bc-dot.upcoming { background:#e0e0e0; }
      #vw-breadcrumb .vw-bc-counter { margin-top:5px; color:#666; font-size:12px; font-family:sans-serif; }
      #vw-breadcrumb .vw-bc-counter strong { color:#3b7ef5; }

      /* ── Scrolly cards ── */
      #vw-steps-scroll { flex:1; overflow-y:scroll; padding-bottom:40vh; }
      .vw-step { min-height:80vh; display:flex; align-items:center; padding:16px 14px; box-sizing:border-box; }
      .vw-card { background:white; padding:20px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.08); opacity:0.4; transition:all 0.3s; border-left:4px solid transparent; width:100%; color:#333; font-family:'DM Sans',sans-serif; font-size:14px; line-height:1.5; }
      .vw-card.active { opacity:1; border-left:5px solid #3b7ef5; transform:scale(1.02); box-shadow:0 6px 20px rgba(59,126,245,0.15); }
      .vw-step-type {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
    border: 1px solid transparent;
}

/* Color Palette for Categories */
.type-structure   { color: #a8a8a8; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
.type-data        { color: #2ecc71; background: rgba(46, 204, 113, 0.1); border-color: rgba(46, 204, 113, 0.2); }
.type-encoding    { color: #3498db; background: rgba(52, 152, 219, 0.1); border-color: rgba(52, 152, 219, 0.2); }
.type-analytical  { color: #9b59b6; background: rgba(155, 89, 182, 0.1); border-color: rgba(155, 89, 182, 0.2); }
.type-interaction { color: #e67e22; background: rgba(230, 126, 34, 0.1); border-color: rgba(230, 126, 34, 0.2); }

/* Card Header Layout Adjustment */
.vw-card-header {
    display: flex;
    align-items: center;
    gap: 8px; /* Spacing between Step # and Type */
    margin-bottom: 12px;
}

.vw-badge {
    margin-bottom: 0 !important; /* Reset existing margin if any */
}
      .vw-step-counter { font-size:11px; color:#aaa; font-family:'DM Mono',monospace; letter-spacing:.04em; background:#f5f5f5; padding:3px 8px; border-radius:20px; }
      .vw-step-counter span { color:#3b7ef5; font-weight:700; }

      /* ── Highlight & dim ── */
      .vw-dim { opacity:0.4 !important; transition:opacity 0.4s; }
      .vw-highlight { opacity:1 !important; }
      g.vw-highlight *, .vw-highlight * { opacity:1 !important; fill-opacity:1; }
      .vw-ring { outline:2px solid #569cd6; outline-offset:3px; }

      /* ── Pulse ── */
      .vw-pulse { animation:vw-pulse-glow 1.5s infinite; }
      @keyframes vw-pulse-glow {
        0%   { filter:drop-shadow(0 0 2px #3498db); stroke-width:2; }
        50%  { filter:drop-shadow(0 0 10px #3498db); stroke-width:5; }
        100% { filter:drop-shadow(0 0 2px #3498db); stroke-width:2; }
      }
      .vw-spotlight-ring { animation:vw-ring-pulse 2s ease-in-out infinite; }
      @keyframes vw-ring-pulse { 0%,100% { opacity:.7; stroke-width:2; } 50% { opacity:1; stroke-width:3; } }
      .vw-connector { fill:none; stroke:#3498db; stroke-width:2; stroke-dasharray:5; animation:vw-dash 1s linear infinite; }
      @keyframes vw-dash { to { stroke-dashoffset:-10; } }
      .vw-locked { border:2px solid #e74c3c !important; background:#fff5f5 !important; }
      .vw-interaction-hint { color:#e74c3c; font-weight:bold; font-size:11px; margin-top:10px; text-transform:uppercase; }

      /* ════════════════════════════════════════════════════
         ELEGANT INSPECTOR PANEL
         ════════════════════════════════════════════════════ */
      #vw-inspector {
        position: fixed;
        top: 72px; right: 16px;
        width: 336px; bottom: 16px;
        background: rgba(11, 12, 17, 0.94);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255,255,255,0.08);
        border-top: 1px solid rgba(255,255,255,0.13);
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.5),
          0 32px 72px rgba(0,0,0,0.65),
          inset 0 1px 0 rgba(255,255,255,0.06);
        border-radius: 18px;
        z-index: 2147483645;
        font-family: 'DM Sans', -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.35s cubic-bezier(0.16,1,0.3,1),
                    transform 0.35s cubic-bezier(0.16,1,0.3,1);
        transform: translateX(14px) scale(0.97);
        overflow: hidden;
        color: #e2e4ea;
      }

      #vw-inspector.visible {
        opacity: 1; pointer-events: auto;
        transform: translateX(0) scale(1);
      }

      /* ── Drag Header ── */
      #vw-insp-drag {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px 12px;
        cursor: grab; flex-shrink: 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        background: rgba(255,255,255,0.025);
        user-select: none;
      }
      #vw-insp-drag:active { cursor: grabbing; }

      .vw-drag-handle {
        display: flex; align-items: center; gap: 9px;
        color: rgba(255,255,255,0.32);
        font-size: 10.5px;
        font-family: 'DM Mono', monospace;
        letter-spacing: 0.13em;
        text-transform: uppercase;
        font-weight: 500;
      }

      .vw-drag-handle::before {
        content: '';
        display: grid;
        grid-template-columns: repeat(3, 3px);
        grid-template-rows: repeat(2, 3px);
        gap: 2.5px;
        width: 14px; height: 10px;
        background-image: radial-gradient(circle, rgba(255,255,255,0.28) 1.2px, transparent 1.2px);
        background-size: 5.5px 5.5px;
      }

      /* ── Scrollable content ── */
      .vw-insp-scroll-area {
        flex: 1; overflow-y: auto; overflow-x: hidden;
        display: flex; flex-direction: column;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.08) transparent;
      }
      .vw-insp-scroll-area::-webkit-scrollbar { width: 3px; }
      .vw-insp-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.09); border-radius: 4px; }

      /* ── Inspector body ── */
      #vw-insp-body { padding: 18px 16px 10px; flex-shrink: 0; }

      .vw-insp-title {
        font-size: 16px; font-weight: 600;
        color: #f0f2f8; letter-spacing: -0.02em; line-height: 1.3;
        margin-bottom: 14px; padding-bottom: 13px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }

      /* ── Collapsible sections ── */
      .vw-collapsible-sect {
        margin-bottom: 5px; border-radius: 10px; overflow: hidden;
        background: rgba(255,255,255,0.025);
        border: 1px solid rgba(255,255,255,0.055);
        transition: background 0.18s;
      }
      .vw-collapsible-sect:hover { background: rgba(255,255,255,0.04); }

      .vw-collapsible-sect summary {
        display: flex; align-items: center; gap: 7px;
        padding: 9px 13px;
        font-size: 10.5px; font-weight: 600;
        letter-spacing: 0.06em; text-transform: uppercase;
        color: rgba(255,255,255,0.38);
        cursor: pointer; list-style: none;
        transition: color 0.18s; user-select: none;
      }
      .vw-collapsible-sect summary::-webkit-details-marker { display: none; }
      .vw-collapsible-sect summary::after {
        content: '›'; margin-left: auto;
        font-size: 15px; color: rgba(255,255,255,0.18);
        transition: transform 0.2s, color 0.2s; display: inline-block;
      }
      .vw-collapsible-sect[open] summary { color: rgba(255,255,255,0.65); }
      .vw-collapsible-sect[open] summary::after { transform: rotate(90deg); color: rgba(255,255,255,0.35); }

      .vw-collapsible-sect .vw-insp-txt {
        padding: 2px 13px 13px;
        font-size: 12.5px; line-height: 1.68;
        color: rgba(200,208,228,0.78); font-weight: 400;
        animation: vw-sect-open 0.18s ease;
      }
      @keyframes vw-sect-open {
        from { opacity:0; transform:translateY(-4px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .vw-sect-icon { font-size: 12px; opacity: 0.65; }

      /* ── AI divider ── */
      .vw-chatbot-branding {
        display: flex; align-items: center; gap: 9px;
        padding: 13px 16px 8px; flex-shrink: 0;
      }
      .vw-chatbot-branding::before {
        content: ''; flex: 1; height: 1px;
        background: linear-gradient(to right, transparent, rgba(255,255,255,0.07));
      }
      .vw-chatbot-branding::after {
        content: ''; flex: 0 0 30px; height: 1px;
        background: rgba(255,255,255,0.05);
      }
      .vw-chatbot-branding span {
        font-family: 'DM Mono', monospace; font-size: 9.5px; font-weight: 500;
        letter-spacing: 0.15em; text-transform: uppercase;
        color: rgba(255,255,255,0.22);
      }
      .vw-ai-sparkle {
        width: 20px; height: 20px; border-radius: 6px;
        background: linear-gradient(135deg, #3b7ef5, #8b5cf6);
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; color: white; flex-shrink: 0;
        box-shadow: 0 2px 10px rgba(59,126,245,0.45);
      }

      /* ── Chat container ── */
      .vw-chat-container {
        display: flex; flex-direction: column;
        flex: 1; min-height: 0;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .vw-chat-messages {
        flex: 1; overflow-y: auto;
        padding: 12px 13px; display: flex; flex-direction: column; gap: 9px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.07) transparent;
        min-height: 100px;
      }
      .vw-chat-messages::-webkit-scrollbar { width: 3px; }
      .vw-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

      /* ── Message bubbles ── */
      .vw-msg {
        max-width: 84%; padding: 9px 13px; border-radius: 14px;
        font-size: 12.5px; line-height: 1.55; font-weight: 400;
        animation: vw-pop 0.22s cubic-bezier(0.34,1.56,0.64,1);
        word-break: break-word;
      }
      @keyframes vw-pop {
        from { transform: scale(0.88) translateY(4px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }
      .vw-msg.bot {
        background: rgba(255,255,255,0.058); color: rgba(215,222,240,0.88);
        align-self: flex-start; border-bottom-left-radius: 4px;
        border: 1px solid rgba(255,255,255,0.065);
      }
      .vw-msg.user {
        background: linear-gradient(135deg, #3067d4, #4f4fd4);
        color: #fff; align-self: flex-end; border-bottom-right-radius: 4px;
        box-shadow: 0 4px 18px rgba(59,126,245,0.32);
      }

      /* ── Chat input ── */
      .vw-chat-input-area {
        display: flex; align-items: center; gap: 8px;
        padding: 11px 13px 13px;
        background: rgba(0,0,0,0.18);
        border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;
      }
      #vw-chat-input {
        flex: 1; background: rgba(255,255,255,0.055);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 22px; color: rgba(225,230,248,0.9);
        padding: 8px 15px; font-size: 12.5px;
        font-family: 'DM Sans', sans-serif; outline: none;
        transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        caret-color: #4f8ef7;
      }
      #vw-chat-input::placeholder { color: rgba(255,255,255,0.18); }
      #vw-chat-input:focus {
        border-color: rgba(59,126,245,0.48);
        background: rgba(255,255,255,0.08);
        box-shadow: 0 0 0 3px rgba(59,126,245,0.1);
      }
      #vw-chat-send {
        width: 32px; height: 32px; border-radius: 50%;
        background: linear-gradient(135deg, #3b7ef5, #5b5ef7);
        border: none; color: white; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        box-shadow: 0 3px 12px rgba(59,126,245,0.4);
      }
      #vw-chat-send:hover { transform: scale(1.1); box-shadow: 0 5px 20px rgba(59,126,245,0.58); filter: brightness(1.08); }
      #vw-chat-send:active { transform: scale(0.93); }
      .vw-audio-btn {
    background: transparent;
    border: none;
    color: #bdc3c7;
    cursor: pointer;
    font-size: 16px;
    padding: 5px;
    transition: color 0.2s;
}
.vw-audio-btn:hover { color: white; }

#vw-editor-overlay {
    position: fixed; top:0; left:0; width:100%; height:100%;
    background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center;
    z-index: 2147483647; font-family: 'DM Sans', sans-serif;
}
#vw-editor-modal {
    background: #1e1e1e; color: white; padding: 24px; border-radius: 12px;
    width: 400px; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5); border: 1px solid #333;
}
#vw-editor-modal h3 { margin: 0 0 10px 0; font-size: 18px; color: #3b7ef5; }
#vw-editor-modal label { font-size: 11px; text-transform: uppercase; color: #888; font-weight: bold; }
#vw-editor-modal textarea { height: 80px; background: #2d2d2d; color: white; border: 1px solid #444; border-radius: 4px; padding: 8px; resize: none; }
#vw-editor-modal select, #vw-editor-modal input { background: #2d2d2d; color: white; border: 1px solid #444; padding: 8px; border-radius: 4px; }
.vw-modal-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.vw-modal-btns button { padding: 8px 16px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; }
#vw-modal-cancel { background: #444; color: white; }
#vw-modal-save.primary { background: #3b7ef5; color: white; }
    `;
        document.head.appendChild(style);
    }


    _showStepEditor(stepIndex = null) {
        const isNew = stepIndex === null;
        const step = isNew ? {
            text: '',
            step_type: 'structure',
            targets: { resolvedSelector: '' },
            actions: ['highlight']
        } : this.steps[stepIndex];

        // Create Modal Overlay
        const overlay = document.createElement('div');
        overlay.id = 'vw-editor-overlay';
        overlay.innerHTML = `
        <div id="vw-editor-modal">
            <h3>${isNew ? 'Add New Step' : 'Edit Step'}</h3>
            
            <label>Step Type</label>
            <select id="edt-type">
                <option value="structure" ${step.step_type === 'structure' ? 'selected' : ''}>Structure</option>
                <option value="data" ${step.step_type === 'data' ? 'selected' : ''}>Data</option>
                <option value="encoding" ${step.step_type === 'encoding' ? 'selected' : ''}>Encoding</option>
                <option value="analytical" ${step.step_type === 'analytical' ? 'selected' : ''}>Analytical</option>
                <option value="interaction" ${step.step_type === 'interaction' ? 'selected' : ''}>Interaction</option>
            </select>

            <label>Description</label>
            <textarea id="edt-text" placeholder="Explain this component...">${step.text}</textarea>

            <label>Target Element</label>
            <div style="display:flex; gap:8px;">
                <input type="text" id="edt-selector" value="${step.targets?.resolvedSelector || ''}" placeholder="Selector (e.g. g.simu)">
                <button id="vw-btn-pick">🎯 Pick</button>
            </div>
            <p style="font-size:10px; color:#888;">Click 'Pick' then click an element in the chart.</p>

            <div class="vw-modal-btns">
                <button id="vw-modal-cancel">Cancel</button>
                <button id="vw-modal-save" class="primary">${isNew ? 'Add Step' : 'Save Changes'}</button>
            </div>
        </div>
    `;
        document.body.appendChild(overlay);

        // --- PICKER LOGIC ---
        document.getElementById('vw-btn-pick').onclick = () => {
            overlay.style.display = 'none'; // Hide modal temporarily
            const svg = document.querySelector('svg');
            svg.style.cursor = 'crosshair';

            const onSvgClick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Try to find a meaningful group or the clicked element
                const target = e.target.closest('g') || e.target;
                let selector = target.id ? `#${target.id}` :
                    target.getAttribute('class') ? `${target.tagName}.${target.getAttribute('class').split(' ')[0]}` :
                        target.tagName;

                document.getElementById('edt-selector').value = selector;

                // Cleanup
                svg.style.cursor = 'default';
                svg.removeEventListener('click', onSvgClick, true);
                overlay.style.display = 'flex'; // Show modal again
            };
            svg.addEventListener('click', onSvgClick, true);
        };

        // --- SAVE LOGIC ---
        document.getElementById('vw-modal-save').onclick = () => {
            const newText = document.getElementById('edt-text').value;
            const newType = document.getElementById('edt-type').value;
            const newSel = document.getElementById('edt-selector').value;

            const actionMap = {
                'structure': ['highlight'],
                'encoding': ['highlight', 'glow', 'annotation'],
                'data': ['highlight', 'annotation'],
                'analytical': ['highlight', 'trace', 'annotation'],
                'interaction': ['highlight', 'pulse', 'wait_for_interaction', 'annotation']
            };


            const updatedStep = {
                ...step,
                text: document.getElementById('edt-text').value,
                step_type: document.getElementById('edt-type').value,
                targets: { resolvedSelector: document.getElementById('edt-selector').value },
                actions: actionMap[newType] || ['highlight']
            };

            if (isNew) this.steps.push(updatedStep);
            else this.steps[stepIndex] = updatedStep;

            overlay.remove();
            this._teardown();
            this._initEditMode(); // Refresh UI
        };

        document.getElementById('vw-modal-cancel').onclick = () => overlay.remove();
    }

    _initEditMode() {
        this._initScrolly();
        document.body.classList.add('vw-editing');

        // 1. Change the "Add" button to trigger the modal
        const stepsScroll = document.getElementById('vw-steps-scroll');
        const addBtn = document.createElement('button');
        addBtn.innerText = "+ Create New Step";
        addBtn.className = "vw-action-btn";
        addBtn.onclick = () => this._showStepEditor();
        stepsScroll.prepend(addBtn);

        // 2. Add Edit/Save buttons to each card
        document.querySelectorAll('.vw-step').forEach((stepDiv, i) => {
            const card = stepDiv.querySelector('.vw-card');
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = "display:flex; justify-content:flex-end; gap:5px; margin-top:10px;";

            btnContainer.innerHTML = `
            <button class="vw-edit-card-btn" style="font-size:10px; cursor:pointer;">Edit Details</button>
            <button class="vw-save-card-btn" style="font-size:10px; cursor:pointer; background:#27ae60; color:white; border:none; border-radius:3px;">Save</button>
        `;

            card.appendChild(btnContainer);

            // Edit button triggers the Modal
            btnContainer.querySelector('.vw-edit-card-btn').onclick = () => this._showStepEditor(i);

            // Quick Save (for text changes made directly in the card)
            btnContainer.querySelector('.vw-save-card-btn').onclick = () => {
                const textEl = card.querySelector('.vw-step-text');
                this.steps[i].text = textEl.innerText;
                alert('Step text saved!');
            };
        });
    }

    // ── SCROLLY (with breadcrumb) ──────────────────────────────
    _initScrolly() {
        document.body.classList.add('vw-scrolly-active');
        this.originalNodes = Array.from(document.body.children).filter(n => !n.id.startsWith('vw-') && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE');

        const left = document.createElement('div'); left.id = 'vw-left';
        const wrapper = document.createElement('div'); wrapper.id = 'vw-scale';
        const right = document.createElement('div'); right.id = 'vw-right';

        this.originalNodes.forEach(n => wrapper.appendChild(n));
        left.appendChild(wrapper);
        document.body.appendChild(left);
        document.body.appendChild(right);

        const total = this.steps.length;

        const bcBar = document.createElement('div');
        bcBar.id = 'vw-breadcrumb';
        bcBar.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
            <div class="vw-bc-label">Progress</div>
            <div class="vw-bc-track" id="vw-bc-track"></div>
        </div>
        <button id="vw-start-audio" class="vw-audio-start-btn">▶ Start Narration</button>
    </div>
    <div class="vw-bc-counter">Step <strong id="vw-bc-num">1</strong> of <strong>${total}</strong></div>
`;
        right.appendChild(bcBar);

        // Event Listener for the start button
        bcBar.querySelector('#vw-start-audio').onclick = (e) => {
            this.narrationStarted = true;
            const currentStep = this.steps[this._currentStepIdx || 0];
            this._speak(currentStep.text);
            e.target.style.display = 'none'; // Hide after starting
        };

        const track = bcBar.querySelector('#vw-bc-track');
        for (let i = 0; i < total; i++) {
            const dot = document.createElement('div');
            dot.className = 'vw-bc-dot' + (i === 0 ? ' current' : ' upcoming');
            dot.dataset.idx = i;
            dot.addEventListener('click', () => {
                const target = right.querySelector(`.vw-step[data-index="${i}"]`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            dot.title = `Step ${i + 1}`;
            track.appendChild(dot);
        }

        const updateBreadcrumb = (idx) => {
            this._currentStepIdx = idx;
            document.getElementById('vw-bc-num').textContent = idx + 1;
            track.querySelectorAll('.vw-bc-dot').forEach((dot, i) => {
                dot.className = 'vw-bc-dot ' + (i < idx ? 'done' : i === idx ? 'current' : 'upcoming');
            });
        };

        const stepsScroll = document.createElement('div');
        stepsScroll.id = 'vw-steps-scroll';
        right.appendChild(stepsScroll);

        this.steps.forEach((step, i) => {
            const div = document.createElement('div');
            div.className = 'vw-step';
            div.dataset.index = i;
            const isLocked = step.actions?.includes('wait_for_interaction');
            const typeLabel = step.step_type || 'general';

            const typeIcons = {
                structure: '🏗️',
                data: '📊',
                encoding: '🎨',
                analytical: '💡',
                interaction: '🖱️'
            };

            const icon = typeIcons[step.step_type] || '📑';

            div.innerHTML = `
        <div class="vw-card ${isLocked ? 'vw-locked' : ''}">
            <div class="vw-card-header">
            <div class="vw-badge">Step ${i + 1}</div>
            <div class="vw-step-type type-${typeLabel}">${icon} ${typeLabel.toUpperCase()}</div>
            </div>
            <div class="vw-step-text">${step.text}</div>
            ${isLocked ? '<div class="vw-interaction-hint">👆 Interaction required</div>' : ''}
        </div>`;
            stepsScroll.appendChild(div);
        });

        const endPad = document.createElement('div'); endPad.style.height = "50vh"; stepsScroll.appendChild(endPad);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const stepIdx = parseInt(entry.target.dataset.index, 10);
                    const step = this.steps[stepIdx];
                    document.querySelectorAll('.vw-card').forEach(c => c.classList.remove('active'));
                    entry.target.querySelector('.vw-card').classList.add('active');
                    updateBreadcrumb(stepIdx);
                    this._applyStepVisuals(step);
                    if (step.actions?.includes('wait_for_interaction')) {
                        this._setupInteractionBlock(step, entry.target, stepsScroll);
                    }
                    if (this.narrationStarted) {
                        this._speak(step.text);
                    }
                }
            });
        }, { root: stepsScroll, threshold: 0.6 });

        stepsScroll.querySelectorAll('.vw-step').forEach(el => observer.observe(el));
        this.scrollyObserver = observer;
    }

    _applyStepVisuals(step) {
        const svg = document.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('.vw-connector').forEach(el => el.remove());
        svg.querySelectorAll('*').forEach(el => el.classList.remove('vw-dim', 'vw-highlight', 'vw-pulse'));
        const selectors = this._resolveSelector(step.targets);
        const isHighlightMultiple = step.actions?.includes('highlight-multiple');
        const hasHighlight = step.actions?.some(a => a.includes('highlight'));

        if (hasHighlight && selectors.length > 0 && !isHighlightMultiple) {
            // Dim all, then un-dim the specific target elements
            svg.querySelectorAll('g, rect, path, circle, text, line').forEach(el => el.classList.add('vw-dim'));
            selectors.forEach(sel => {
                svg.querySelectorAll(sel).forEach(el => {
                    el.classList.remove('vw-dim');
                    el.classList.add('vw-highlight');
                    if (step.actions.includes('pulse')) el.classList.add('vw-pulse');
                    let p = el.parentElement;
                    while (p && p !== svg) { p.classList.remove('vw-dim'); p = p.parentElement; }
                });
            });
            showSpotlight(selectors);
        } else {
            // No specific target, or highlight-multiple, or no highlight action:
            // show everything at full opacity — never leave the SVG stuck all-dim
            svg.querySelectorAll('*').forEach(el => el.classList.remove('vw-dim', 'vw-highlight', 'vw-pulse'));
            removeSpotlight();
        }
        if (step.actions?.includes('draw_connectors') && step.sync_targets) {
            this._drawSVGConnectors(svg, step.targets.resolvedSelector, step.sync_targets);
        }
    }

    _setupInteractionBlock(step, stepElement, scrollContainer) {
        const targetEl = document.querySelector(this._resolveSelector(step.targets)[0]);
        if (!targetEl) return;
        scrollContainer.style.overflowY = 'hidden';
        const unlock = () => {
            stepElement.querySelector('.vw-card').classList.remove('vw-locked');
            stepElement.querySelector('.vw-interaction-hint')?.remove();
            scrollContainer.style.overflowY = 'scroll';
            targetEl.removeEventListener('click', unlock);
        };
        targetEl.addEventListener('click', unlock);
    }

    _drawSVGConnectors(svg, sourceSelector, targetSelectors) {
        const source = svg.querySelector(sourceSelector);
        if (!source) return;
        const sBox = source.getBBox();
        const sX = sBox.x + sBox.width, sY = sBox.y + sBox.height / 2;
        targetSelectors.forEach(sel => {
            const target = svg.querySelector(sel);
            if (!target) return;
            const tBox = target.getBBox();
            const tX = tBox.x, tY = tBox.y + tBox.height / 2;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M ${sX} ${sY} C ${sX + 50} ${sY}, ${tX - 50} ${tY}, ${tX} ${tY}`);
            path.setAttribute("class", "vw-connector");
            svg.appendChild(path);
        });
    }

    _resolveSelector(targets) {
        if (!targets) return [];
        if (targets.resolvedSelector) return [targets.resolvedSelector];
        let found = [];
        const priorities = ['encoding', 'interaction', 'view'];
        for (let type of priorities) {
            if (targets[type]?.candidates) {
                targets[type].candidates.forEach(c => { if (c.selector) found.push(c.selector); });
            }
        }
        return [...new Set(found)];
    }

    _addNewStep() {
        const newStep = { step_id: `step_${Date.now()}`, text: "New step description…", targets: {}, actions: ['highlight'] };
        this.steps.push(newStep);
        this._teardown();
        this._initEditMode();
        setTimeout(() => {
            const s = document.getElementById('vw-steps-scroll');
            if (s) s.scrollTop = s.scrollHeight;
        }, 100);
    }

    _saveFromDOM() {
        document.querySelectorAll('.vw-step').forEach((card, i) => {
            const textEl = card.querySelector('.vw-step-text');
            if (this.steps[i] && textEl) this.steps[i].text = textEl.innerText;
        });
    }

    exportConfig() {
        if (this.mode === 'edit') this._saveFromDOM();
        const dataStr = "const RAW_STEPS = " + JSON.stringify(this.steps, null, 4) + ";";
        const blob = new Blob([dataStr], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "content.js";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    _teardown() {
        if (this.synth) {
            this.synth.cancel();
        }

        if (this.scrollyObserver) this.scrollyObserver.disconnect();
        removeSpotlight();
        if (window._vwSpotlightCleanup) { window._vwSpotlightCleanup(); window._vwSpotlightCleanup = null; }
        const left = document.getElementById('vw-left');
        const right = document.getElementById('vw-right');
        const wrapper = document.getElementById('vw-scale');
        if (this.originalNodes.length > 0) {
            this.originalNodes.forEach(n => { if (n.style) n.style.transform = ''; document.body.appendChild(n); });
        } else if (wrapper) { while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild); }
        if (left) left.remove();
        if (right) right.remove();
        this.originalNodes = [];  // reset so next _initScrolly collects fresh nodes
        document.body.classList.remove('vw-scrolly-active');
        const insp = document.getElementById('vw-inspector');
        if (insp) insp.remove();  // fully remove so _initExplore re-creates it fresh with re-bound events
        if (this.exploreHandler) {
            document.body.removeEventListener('mouseover', this.exploreHandler);
            this.exploreHandler = null;
        }
        document.querySelectorAll('.vw-dim, .vw-highlight, .vw-ring').forEach(el => {
            el.classList.remove('vw-dim', 'vw-highlight', 'vw-ring');
        });
    }

    _renderToggleBar() {
        if (document.getElementById('vw-toggle-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'vw-toggle-bar';
        let html = `
      <button class="vw-toggle-btn" id="vw-btn-scrolly">Guided Tour</button>
      <button class="vw-toggle-btn" id="vw-btn-explore">Free Exploration</button>`;
        if (this.isAuthorMode) {
            html += `
        <div class="vw-toggle-divider"></div>
        <button class="vw-toggle-btn" id="vw-btn-edit">✎ Edit</button>
        <button class="vw-toggle-btn" id="vw-btn-export">↓ Export</button>`;
        }
        html += `<button class="vw-toggle-btn" id="vw-btn-close" style="margin-left:4px;color:rgba(255,100,100,0.6);">✕</button>`;
        bar.innerHTML = html;
        const audioControls = document.createElement('div');
        audioControls.style.cssText = "display:flex; align-items:center; margin-left:10px; border-left:1px solid #555; padding-left:10px; gap:5px;";
        audioControls.innerHTML = `
        <button class="vw-audio-btn" id="vw-btn-replay" title="Replay Narration">↺</button>
        <button class="vw-audio-btn" id="vw-btn-mute" title="Mute/Unmute">🔊</button>
    `;
        bar.appendChild(audioControls);
        document.body.appendChild(bar);
        document.getElementById('vw-btn-scrolly').onclick = () => this.setMode('scrolly');
        document.getElementById('vw-btn-explore').onclick = () => this.setMode('explore');
        document.getElementById('vw-btn-close').onclick = () => { this.setMode('none'); bar.remove(); };
        if (this.isAuthorMode) {
            document.getElementById('vw-btn-edit').onclick = () => this.setMode('edit');
            document.getElementById('vw-btn-export').onclick = () => this.exportConfig();
        }
        document.getElementById('vw-btn-replay').onclick = () => {
            const activeStep = this.steps[this.currentStepIdx || 0];
            if (activeStep) this._speak(activeStep.text);
        };

        const muteBtn = document.getElementById('vw-btn-mute');
        muteBtn.onclick = () => {
            this.isMuted = !this.isMuted;
            muteBtn.innerText = this.isMuted ? '🔇' : '🔊';
            if (this.isMuted) this.synth.cancel();
        };
    }
}

// ─────────────────────────────────────────────────────────────
//  UTILITY FUNCTIONS (unchanged)
// ─────────────────────────────────────────────────────────────
async function getSVGAsBitmap(svgElement) {
    return new Promise((resolve, reject) => {
        // 1. Serialize SVG to XML
        const svgData = new XMLSerializer().serializeToString(svgElement);

        // 2. Create a Blob and URL
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // 3. Load into an Image object
        const img = new Image();
        img.onload = () => {
            // 4. Draw to Canvas
            const canvas = document.createElement('canvas');
            canvas.width = svgElement.clientWidth || 800; // Fallback width
            canvas.height = svgElement.clientHeight || 600; // Fallback height
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // 5. Export as Base64 PNG
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            URL.revokeObjectURL(url);
            resolve(base64);
        };
        img.onerror = reject;
        img.src = url;
    });
}

async function semanticInference(svgContent, description, b64Image, apiKey, code) {

    try {
        let messages = [{
            "role": "system", "content": `
    You are an expert in data visualization analysis, visualization onboarding design, and composite visualization reasoning.

    Your task is to analyze a composite visualization provided as:
    1) an SVG specification
    2) a rendered bitmap image of the same visualization

    and propose:
    A) a set of high-level visual views (panels or conceptual regions), and
    B) a sequence of suggested explanation steps suitable for onboarding a first-time viewer.

    Your explanations MUST explicitly cover the following categories of knowledge when applicable:
    1) Structural Knowledge
    2) Visual Encoding Knowledge
    3) Data Knowledge
    4) Analytical Knowledge
    5) Interaction Knowledge

    --------------------------------
    STRATEGIC NARRATIVE RULES 
    --------------------------------
    - Relational Logic: Explain how views relate to one another (e.g., if one view filters another, or if a header is shared between two charts).
    - Dual-Encoding Clarity: If a single mark uses multiple channels (e.g., color and size), explain how to interpret them in tandem.
    - Action-Oriented Language: Use short directives that guide attention (e.g., "Look at the colored dots," "Follow the bars from left to right").
    - The "Aha" Moment: Include at least one analytical insight that describes a pattern unique to this specific visualization type.

    KEYWORD ANCHORING: You must use specific "mark-based" keywords in your explanation_text to describe data points. Use words like "individual card," "colored dot," "outlined box," or "specific mark." Avoid aggregate terms like "the layout," "the panel," or "the area" when describing data knowledge or visual encodings.
    -------------------------------- 
    PRECISION & ATOMIC TARGETING (CRITICAL) 
    --------------------------------
    - Target the "Atomic" Mark: 
  When explaining visual encodings or data points, focus on the smallest visual units that encode data (dots, bars, glyphs).

  Structural and workflow explanations may refer to entire views when describing layout or relationships between views.

    --------------------------------
    CONCEPTUAL FRAMING RULE (CRITICAL)
    --------------------------------

    Before explaining visual encodings, the onboarding must establish the conceptual purpose of the visualization.

    The first structural steps must answer:

    1. What is the overall goal of this visualization?
    2. What are the main modules or views that support this goal?
    3. What role does each view play in the analysis workflow?

    For composite visualizations that contain overview–detail structures, explicitly explain:

    - which view provides a high-level summary
    - which view provides detailed information
    - how users move between them

    Do NOT begin onboarding with mark-level explanations (dots, rectangles, curves) until the conceptual roles of the views are clear.

    --------------------------------
    CROSS-VIEW COORDINATION RULE
    --------------------------------

    Composite visualizations often rely on relationships between views.

    At least TWO explanation steps must explicitly describe how views are connected.

    Examples of relationships include:

    - overview → detail navigation
    - filtering or selection between views
    - highlighting relationships
    - shared axes or timelines
    - causal relationships between views (e.g., events in one view produce changes in another)

    These coordination steps must explain how a user should move their attention between views to understand the data.
    --------------------------------
    IMPORTANT CONSTRAINTS
    --------------------------------
    - You are NOT allowed to generate CSS selectors, element IDs, or executable code.
    - You are NOT allowed to invent labels or interactions that do not visually exist.
    - You must reason at a semantic and conceptual level only.
    - Your output will be validated and grounded by a downstream system.
    - Think of your role as an onboarding narrator who writes the actual explanation text that a first-time user would read while being guided through the visualization.

    --------------------------------
    WHAT COUNTS AS A VIEW
    --------------------------------
    A "view" is a visually and conceptually distinct region of the visualization.

    For composite visualizations:
    - EACH individual chart must be treated as a separate view
    - Do NOT merge multiple charts into a single "main plot" view.

    Additional views may include:
    - legend regions
    - shared axes
    - individual axes
    - overview or detail panels
    - auxiliary components that support interpretation

    Composite visualizations may contain:
    - multiple views of the same or different chart types
    - shared components (e.g., legends or axes used by multiple views)

    Each view must correspond to a meaningful visual entity.
    Avoid Over-Grouping: Do not group multiple distinct charts into a single "main view."

    SUB-VIEW HIERARCHY RULE: If a chart contains a distinct layer of data marks (e.g., a collection of movie cards, a layer of scatter points, or a series of glyphs), you MUST define that layer as its own view_id (e.g., movie_cards_left). Do not let the "main chart" view absorb the marks that encode the actual data points.

    SEMANTIC COMPONENT RULE: If a view contains multiple distinct, labeled categories (e.g., individual genre regions like "Romance," "Action," or "Drama"), you MUST treat each labeled category as a potential specific sub-view.

    If an explanation step focuses on one specific category/genre, the target_view_id must be that specific category (e.g., view_id: "genre_mystery_crime") rather than the entire chart.

    Even if these categories overlap, define them as separate logical entities so the user's eye can be guided to that specific color/region.
    --------------------------------
    WHAT COUNTS AS AN EXPLANATION STEP
    --------------------------------
    Each explanation step must generate the ACTUAL onboarding explanation text shown to users.

    Each step must:
    - Be written in clear, human-readable language
    - Be specific to the visual elements and data shown
    - Sound like guided onboarding copy (not an abstract description of intent)
    - Explain EXACTLY ONE concept
    - Belong to ONE knowledge category only

    Each explanation step must communicate only ONE idea.

    If an explanation requires multiple ideas, split them into separate steps.

    Your goal is to guide a user's eye. CRITICAL RULE: Do not default to target_view_id: "multiple".
    Use "multiple" ONLY for the very first structural step describing the overall layout.

    For all other steps (Encoding, Data, Analytical), you MUST select the most representative specific view_id. (e.g., instead of saying "The bars represent..." for the whole screen, target bar_chart_A and say "In this chart, the bars represent...").

    1) STRUCTURAL KNOWLEDGE
    - Describe the overall composition of the composite visualization
    - Explain layout patterns (e.g., small multiples, coordinated views, overlays)
    - Explain shared structural elements (shared axes, legends) and how they connect different views.

    2) VISUAL ENCODING KNOWLEDGE
    - Explain how data attributes are encoded using position, color, size, shape, or marks
    - Focus on how to read each individual mark within a view.

    3) DATA KNOWLEDGE
    - Explain what data is being shown in each view (variables, units, categories, time)

    4) ANALYTICAL KNOWLEDGE
    - Explain insights, trends, comparisons, or relationships
    - Analytical explanations must teach the user HOW to interpret patterns

    Each analytical step must include:
    1. A visual pattern to look for
    2. What that pattern means in the data
    3. Why the pattern matters for analysis

    Examples of meaningful patterns include:
    - repeated sequences
    - unusual spikes or drops
    - sustained increases or decreases
    - asymmetric flows
    - clusters or outliers
    - cause–effect relationships between views

    Avoid vague statements like:
    "Trends can be observed here."

    Instead guide the user’s eye toward a specific pattern in the marks.

    5) INTERACTION KNOWLEDGE
    - Infer and describe supported interactions (e.g., hover, filter, brush, zoom)
    - Explain what tasks these interactions enable and why they are useful

    DO NOT:
    - Combine multiple knowledge categories into a single step
    - Describe low-level SVG or implementation details
    - Treat multiple individual charts as one view

    --------------------------------
    Brevity and Cognitive Load Rules (CRITICAL)
    --------------------------------

    The explanation_text is written for novice users who are seeing the visualization for the first time.

    To reduce cognitive load:

    - Each explanation_text MUST be short and concise.
    - Limit each explanation to **1–2 sentences maximum**.
    - Prefer **15–35 words per step** when possible.
    - Use simple, direct language.

    Avoid:
    - long paragraphs
    - multi-clause explanations
    - theoretical descriptions
    - repeating information already explained in earlier steps

    Each step should communicate **only the essential idea needed to move the user’s attention forward**.

    COGNITIVE LOAD STRUCTURING RULE

    When a visualization contains many visual encodings, explanations must be introduced progressively.

    Recommended order of explanation:

    1. Structural overview
    2. View purpose and data context
    3. Primary visual encodings
    4. Secondary visual encodings
    5. Analytical interpretation
    6. Interaction mechanisms

    Avoid introducing many different visual encodings consecutively without explaining their analytical role.

    --------------------------------
    OUTPUT FORMAT (STRICT)
    --------------------------------
    Return ONLY a valid JSON object with the following structure:

    {
    "views": [
        {
        "view_id": "short symbolic name (e.g., bar_chart_1)",
        "view_role": "overview | detail | auxiliary | shared",
        "chart_type": "bar | line | scatter | treemap | map | legend | axis | unknown",
        "approximate_position": "left | right | top | bottom | center | multiple",
        "description": "What this view shows in plain, user-facing language"
        }
    ],
    "explanation_steps": [
        {
        "step_type": "structure | encoding | data | analytical | interaction",
        "target_view_id": "view_id from the views list, or 'multiple' if shared",
        "priority": "integer starting from 1 (lower = earlier)",
        "explanation_text": "Human-readable onboarding explanation text written for an end user, grounded in the visible visualization and data"
        }
    ]
    }

    --------------------------------
    QUALITY REQUIREMENTS
    --------------------------------
    - Progression: structural → view/data → encodings → analytical → interactions.
    - Include at least: one structural step, one encoding step, one data step, one analytical step.
    - Insightfulness: Analytical steps must explain *how* to find a trend, not just that a trend exists.
    - Coordination: If views are linked (e.g., shared headers), at least one step must explain that connection.
    - If interactions are visible, include interaction steps.
    - Use conservative judgments; if unsure, mark chart_type as "unknown".
    - explanation_text must never exceed 2 sentences.
    Workflow Guidance Requirement:
    At least one explanation step must describe the typical analysis workflow supported by the visualization.

    This step should explain how a user should move through the views to investigate insights.

    Examples:
    - start with an overview to identify interesting cases
    - select a case to inspect detailed behavior
    - examine supporting views to understand causes or consequences

    IMPORTANT:
    - Do NOT describe what you intend to explain.
    - Do NOT summarize or label the step.
    - You MUST write the actual explanation text a user would read during onboarding.
    - The explanation_text should be understandable without referencing SVG, code, or system concepts.

        --------------------------------
    STYLE EXAMPLES
    --------------------------------

    Good explanation_text examples:

    ✔ "Each colored dot represents one country. Its horizontal position shows GDP, while the vertical position shows life expectancy."

    ✔ "Look at the cluster of large circles near the top-right. These marks indicate countries with both high GDP and high life expectancy."

    ✔ "The legend connects colors to categories. Use it to identify which dots belong to each region."

    Avoid long explanations like:

    ✘ "This visualization provides a comprehensive representation of the relationships between multiple economic indicators across different nations..."

    --------------------------------
    INPUT
    --------------------------------
    The SVG code and rendered image will be provided next.

    `},
        {
            "role": "user",
            "content": [
                {
                    "type": "text", "text": `
    ## Composite Visualization Input

    ### VISUALIZATION CONTEXT
    **User Description:** ${description}
    **Implementation Code (D3.js):**
    ${code || "No source code provided."}

    ### SVG
    ${svgContent}

    Analyze the visualization and return ONLY the JSON object described above.

    `},
                { "type": "image_url", "image_url": { "url": `data:image/png;base64,${b64Image}` } }
            ],
        }
        ]

        console.log("🔍 Analyzing visualization with semantic inference...");
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5", // or "gpt-4" if you have access
                messages: messages,
            })
        });

        const data = await res.json();
        console.log("✅ Analysis complete. Raw response:", data);
        if (data.error) throw new Error(data.error.message);
        return JSON.parse(data.choices[0].message.content);
    } catch (err) {
        console.error("❌ Error during semantic inference:", err);
        throw err;
    }
    // client = openai.OpenAI(api_key=apiKey)



}

async function semanticGrounding(svgContent, viewIdList, b64Image, apiKey) {
    // client = openai.OpenAI(api_key=apiKey) 

    try {
        let messages = [{
            "role": "system", "content": `
    You are an expert in SVG structure analysis and data visualization semantics.

    Your task is to map high-level visualization components AND their
    visual encodings to EXACT SVG selectors that already exist in the SVG code.

    You must reason about:
    - structural components (views, axes, legends)
    - encoding components (marks such as bars, lines, points, areas)
    - interaction components (legend items, hoverable regions)

    IMPORTANT RULES:
   - You must NOT invent IDs, classes, or attributes.
    - You must ONLY use selectors that exactly match the SVG.
    - You may return MULTIPLE candidate selectors per component.
    - Prefer selectors that directly target MARKS for encoding explanations.
    - Prefer IDs > classes > structural selectors.
    - When selecting by color attributes (fill or stroke), ALWAYS append the 'i' flag to the attribute selector (e.g., [fill="#ef232a" i]) to ensure matches regardless of hex case normalization.
    - If a component has multiple identifying attributes (like a specific fill and stroke), include both in the selector to ensure precision.
    - Do NOT return executable code.
    - Output JSON ONLY.

    `},
        {
            "role": "user",
            "content": [
                {
                    "type": "text", "text": `
    Given the following SVG and the identified visualization components,
    return candidate SVG selectors for BOTH:

    1) View-level components (containers, axes, legends)
    2) Encoding-level components (marks used to encode data: bars, lines, points)

    --------------------------------
    COMPONENTS TO MAP
    --------------------------------

    For EACH component, return selectors for:

    - "view": the container or structural group
    - "encoding": the SVG marks that encode data (if applicable)
    - "interaction": interactive sub-elements (if applicable)

    Components:
    ${viewIdList.join(", ")}
    --------------------------------
    SVG
    --------------------------------
    ${svgContent}

    Return JSON in the following format:

    {{
    "component_id": {{
    "view": {{
    "candidates": [ {{
    "selector": "...",
    "confidence": "high|medium|low",
    "reason": "container or structural grouping"
    }}]}},
    "encoding": {{
    "candidates": [
    {{
    "selector": "...",
    "confidence": "high|medium|low",
    "reason": "marks that visually encode data"
    }}
    ]
    }},
    "interaction": {{
    "candidates": [
    {{
    "selector": "...",
    "confidence": "high|medium|low",
    "reason": "elements supporting interaction"
    }}
    ]
    }}
    }}
    }}

    Return JSON only. Do not explain your reasoning outside the fields.

    `}, { "type": "image_url", "image_url": { "url": `data:image/png;base64,${b64Image}` } }
            ],
        }
        ]
        console.log("🔍 Performing semantic grounding to map components to SVG selectors...");

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-5",
                messages: messages,
            })
        })

        const data = await res.json();
        console.log("✅ Grounding complete. Raw response:", data);
        if (data.error) throw new Error(data.error.message);
        return JSON.parse(data.choices[0].message.content);
    } catch (err) {
        console.error("❌ Error during semantic grounding:", err);
        throw err;
    }



}

async function generateDynamicOnboarding(svgContent, description, b64Image, apiKey, code) {
    updateLoadingProgress("Performing Semantic Inference...", 25);
    // ⚠️ REPLACE THIS WITH YOUR ACTUAL KEY
    if (!apiKey || apiKey.includes('YOUR_OPENAI')) {
        alert("Please configure your OpenAI API Key in the code first.");
        return [];
    }


    narrativeData = await semanticInference(svgContent, description, b64Image, apiKey, code);

    console.log("Narrative Data from LLM:", narrativeData);


    const viewIdList = narrativeData.views.map(view => view.view_id);

    updateLoadingProgress("Performing Semantic Grounding...", 50);

    mappingData = await semanticGrounding(svgContent, viewIdList, b64Image, apiKey);

    console.log("Mapping Data from LLM:", mappingData);

    updateLoadingProgress("Validating Selectors...", 75);

    layoutViews = getViewRegions();



    return narrativeData.explanation_steps.map((step, i) => {
        const viewId = step.target_view_id;
        const componentMapping = mappingData[viewId] || {};

        const bestSelector = selectBestCandidate(componentMapping, layoutViews);
        // console.log(`Best selector for ${viewId}:`, bestSelector);

        // Action mapping based on knowledge categories
        const actionMap = {
            'structure': ['highlight-multiple'],
            'encoding': ['highlight', 'glow', 'annotation'],
            'data': ['highlight', 'annotation'],
            'analytical': ['highlight', 'trace', 'annotation'],
            'interaction': ['glow','pulse', 'annotation']
        };

        return {
            step_id: `step_${i + 1}`,
            text: step.explanation_text,
            step_type: step.step_type,
            targets: {
                target_view_id: viewId,
                resolvedSelector: bestSelector,
                raw: componentMapping // Keep raw for debugging
            },
            actions: actionMap[step.step_type] || ['highlight']
        };
    });


}

// ─────────────────────────────────────────────────────────────
//  EXTENSION MESSAGE LISTENER
// ─────────────────────────────────────────────────────────────
if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        if (request.action === "GENERATE_AND_LAUNCH") {
            const { description, code } = request.payload;
            console.log("Received request to generate onboarding with description:", description);
            const svgElement = document.querySelector('svg');
            if (!svgElement) { alert("No SVG found on this page!"); return; }
            showLoadingToast();
            try {
                showLoadingToast("Capturing SVG...");
                const b64Image = await getSVGAsBitmap(svgElement);
                const tempInstance = new VisWalkthrough({});
                const apiKey = tempInstance.apiKey;
                // 1. Run the live pipeline from your notebook
                const dynamicSteps = await generateDynamicOnboarding(
                    svgElement.outerHTML,
                    description,
                    b64Image,
                    apiKey,
                    code
                );
                updateLoadingProgress("Generating Scrollytelling...", 90);
                setTimeout(() => {
                    removeLoadingToast();
                }, 800);
                // removeLoadingToast();
                if (window.visWalkthroughInstance) window.visWalkthroughInstance._teardown();
                window.visWalkthroughInstance = new VisWalkthrough({ steps: dynamicSteps, bitmap: b64Image });
                window.visWalkthroughInstance.init();
                window.visWalkthroughInstance.setMode('edit');
            } catch (error) {
                console.error("Dynamic Generation Failed:", error);
                removeLoadingToast();
                alert("AI Analysis failed. See console.");
            }
        }
    });
}

function showLoadingToast(initialStatus = "Initializing...") {
    if (document.getElementById('vw-loading-toast')) {
        updateLoadingProgress(initialStatus);
        return;
    }
    const toast = document.createElement('div');
    toast.id = 'vw-loading-toast';
    toast.innerHTML = `
        <div class="vw-toast-content">
            <div class="vw-toast-main">
                <div class="vw-spinner"></div>
                <div id="vw-toast-status">${initialStatus}</div>
            </div>
            <div class="vw-progress-track">
                <div id="vw-progress-bar"></div>
            </div>
        </div>
        <style>
            #vw-loading-toast {
                position: fixed; bottom: 20px; right: 20px; z-index: 999999;
                background: rgba(14, 15, 20, 0.95); backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
                padding: 16px; width: 280px; color: white; font-family: 'DM Sans', sans-serif;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .vw-toast-main { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
            .vw-spinner {
                width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.1);
                border-top-color: #3b7ef5; border-radius: 50%; animation: spin 0.8s linear infinite;
            }
            #vw-toast-status { font-size: 13px; font-weight: 500; color: #e0e6f8; }
            .vw-progress-track { width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
            #vw-progress-bar { width: 5%; height: 100%; background: #3b7ef5; transition: width 0.4s ease; }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
    `;
    document.body.appendChild(toast);
}

function updateLoadingProgress(status, percent) {
    const statusEl = document.getElementById('vw-toast-status');
    const barEl = document.getElementById('vw-progress-bar');
    if (statusEl) statusEl.innerText = status;
    if (barEl) barEl.style.width = `${percent}%`;
}

function removeLoadingToast() {
    const toast = document.getElementById('vw-loading-toast');
    if (toast) toast.remove();
}
