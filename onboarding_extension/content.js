// ==========================================
// THE VIS WALKTHROUGH LIBRARY
// ==========================================

class VisWalkthrough {
    constructor(config) {
        this.steps = config.steps || [];
        this.theme = { primary: '#2c3e50', highlight: '#9b59b6' };
        this.mode = 'none'; // 'scrolly', 'explore', 'edit'
        this.originalNodes = [];
        this.observer = null;
        this.handler = null;
        this.isAuthorMode = true;
        
        // Chatbot State
        this.currentContext = null; // Which component is selected?
        this.chatHistory = [];
        
        // --- CONFIGURATION ---
        // ⚠️ REPLACE THIS WITH YOUR ACTUAL KEY
        this.apiKey = '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'; 
    }

    init() {
        if(document.getElementById('vw-styles')) return;
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
        if(btn) btn.classList.add('active');

        if (newMode === 'scrolly') this._initScrolly();
        else if (newMode === 'explore') this._initExplore();
        else if (newMode === 'edit') this._initEditMode();
    }

    // --- EXPLORE LOGIC (UPDATED WITH REAL API) ---
    _initExplore() {
        const steps = this._generalizeData(this.steps);
        let insp = document.getElementById('vw-inspector');
        
        if(!insp) {
            insp = document.createElement('div');
            insp.id = 'vw-inspector';
            insp.innerHTML = `
                <div class="vw-insp-head"><span>INSPECTOR MODE</span></div>
                <div class="vw-insp-content" id="vw-insp-body"></div>
                
                <div class="vw-chat-container">
                    <div class="vw-chat-messages" id="vw-chat-history">
                        <div class="vw-msg bot">Hi! I'm powered by AI. Ask me about the highlighted component.</div>
                    </div>
                    <div class="vw-chat-input-area">
                        <input type="text" id="vw-chat-input" placeholder="Ask a question..." autocomplete="off">
                        <button id="vw-chat-send">➤</button>
                    </div>
                </div>
            `;
            document.body.appendChild(insp);
        }
        setTimeout(() => insp.classList.add('visible'), 50);

        // Bind Chat Events
        const input = document.getElementById('vw-chat-input');
        const sendBtn = document.getElementById('vw-chat-send');
        const historyDiv = document.getElementById('vw-chat-history');
        
        const sendMsg = async () => {
            const txt = input.value.trim();
            if(!txt) return;
            
            // 1. Add User Message
            this._addChatMessage('user', txt);
            input.value = '';

            // 2. Add Temporary "Thinking" Bubble
            const loadingId = 'loading-' + Date.now();
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'vw-msg bot vw-loading';
            loadingMsg.id = loadingId;
            loadingMsg.innerText = 'Thinking...';
            historyDiv.appendChild(loadingMsg);
            historyDiv.scrollTop = historyDiv.scrollHeight;
            
            try {
                // 3. Call ChatGPT API
                const response = await this._fetchChatGPTResponse(txt);
                
                // 4. Remove Loading & Add Bot Response
                document.getElementById(loadingId).remove();
                this._addChatMessage('bot', response);
            } catch (error) {
                document.getElementById(loadingId).remove();
                this._addChatMessage('bot', "Error: Could not reach AI. Check console/API Key.");
                console.error(error);
            }
        };

        sendBtn.onclick = sendMsg;
        input.onkeypress = (e) => { if(e.key === 'Enter') sendMsg(); };

        // Render Panel Content
        const render = (s) => {
            this.currentContext = s; // Save context for chatbot
            document.getElementById('vw-insp-body').innerHTML = `
                <div class="vw-insp-title">${s.title}</div>
                <div class="vw-insp-sect"><div class="vw-insp-lbl">👀 Encoding</div><div class="vw-insp-txt">${s.content.encoding}</div></div>
                <div class="vw-insp-sect"><div class="vw-insp-lbl">💡 Insight</div><div class="vw-insp-txt">${s.content.insight}</div></div>
                <div class="vw-insp-sect"><div class="vw-insp-lbl">🖱️ Interaction</div><div class="vw-insp-txt">${s.content.interaction}</div></div>
            `;
        };

        const overview = steps.find(s => s.step_id === 'General_Overview') || steps[0];
        render(overview);

        this.exploreHandler = (e) => {
            if (e.target.closest('#vw-inspector') || e.target.closest('#vw-toggle-bar')) return;
            let match = null;
            for (let step of steps) {
                if (step.selector && e.target.closest(step.selector)) {
                    match = step;
                    break;
                }
            }
            
            document.querySelectorAll('.vw-ring').forEach(el => el.classList.remove('vw-ring'));
            if (match) {
                render(match);
                const el = e.target.closest(match.selector);
                if (el) el.classList.add('vw-ring');
            }
        };
        document.body.addEventListener('mousemove', this.exploreHandler);
    }

    _addChatMessage(role, text) {
        const history = document.getElementById('vw-chat-history');
        const msg = document.createElement('div');
        msg.className = `vw-msg ${role}`;
        msg.innerText = text;
        history.appendChild(msg);
        history.scrollTop = history.scrollHeight;
    }

    // --- NEW: CHATGPT API INTEGRATION ---
    async _fetchChatGPTResponse(userQuestion) {
        if (!this.apiKey || this.apiKey.includes('YOUR_OPENAI')) {
            return "Please configure your OpenAI API Key in the code first.";
        }

        // 1. Prepare Context from Steps
        // We create a concise summary of the data for the System Prompt
        const contextData = JSON.stringify(this.steps.map(s => ({
            component: s.step_id,
            description: s.text,
            visual_targets: s.targets
        })));

        // 2. Identify Current Selection
        const currentFocus = this.currentContext ? this.currentContext.title : "the general overview";
        const currentDetails = this.currentContext ? JSON.stringify(this.currentContext.content) : "";

        // 3. Construct Messages
        const messages = [
            {
                role: "system",
                content: `You are an expert data visualization assistant for a system called 'DiffSeer'. 
                
                Here is the reference data for the visualization components (STEPS):
                ${contextData}

                The user is currently looking at: ${currentFocus}.
                Details of current view: ${currentDetails}.
                
                Answer the user's question based strictly on the reference data provided above. 
                Keep answers concise (under 50 words) and helpful.`
            },
            {
                role: "user",
                content: userQuestion
            }
        ];

        // 4. Fetch
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4", // or "gpt-4" if you have access
                messages: messages,
                temperature: 0.7,
                max_tokens: 150
            })
        });

        const data = await res.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        return data.choices[0].message.content.trim();
    }

    // --- STYLES ---
    _injectStyles() {
        const style = document.createElement('style');
        style.id = 'vw-styles';
        style.textContent = `
            #vw-toggle-bar { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); display: flex; background: ${this.theme.primary}; padding: 5px; border-radius: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 2147483647; font-family: sans-serif; }
            .vw-toggle-btn { padding: 10px 20px; border: none; background: transparent; color: #bdc3c7; font-weight: bold; font-size: 14px; cursor: pointer; border-radius: 25px; transition: all 0.3s; outline: none; }
            .vw-toggle-btn.active { background: #3498db; color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
            .vw-toggle-btn:hover:not(.active) { color: white; }
            .vw-action-btn { width: 90%; margin: 10px auto; display: block; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
            
            /* Scrolly */
            body.vw-scrolly-active { overflow: hidden !important; }
            #vw-left { position: fixed; top: 0; left: 0; width: calc(100% - 300px); height: 100vh; overflow: auto; background: white; z-index: 2147483640; }
            #vw-right { position: fixed; top: 0; right: 0; width: 300px; height: 100vh; overflow-y: scroll; background: #fcfcfc; border-left: 1px solid #eee; z-index: 2147483641; }
            #vw-scale { transform-origin: top left; transition: transform 0.3s ease; padding: 20px; }
            .vw-step { min-height: 80vh; display: flex; align-items: center; padding: 20px; box-sizing: border-box; }
            .vw-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); opacity: 0.4; transition: all 0.3s; border-left: 4px solid transparent; width: 100%; color: #333; font-family: sans-serif; font-size: 14px; line-height: 1.5; }
            .vw-card.active { opacity: 1; border-left: 5px solid ${this.theme.highlight}; transform: scale(1.02); }
            .vw-badge { background: ${this.theme.highlight}; color: white; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; display: inline-block; }
            
            /* Highlights */
            .vw-dim { opacity: 0.8 !important; transition: opacity 0.5s; }
            .vw-highlight { opacity: 1 !important; stroke: ${this.theme.highlight} !important; filter: none !important; }
            g.vw-highlight *, .vw-highlight * { opacity: 1 !important; fill-opacity: 1; stroke: ${this.theme.highlight} !important; }
            .vw-ring { outline: 2px solid #569cd6; outline-offset: 3px; }

            /* INSPECTOR + CHAT STYLES */
            #vw-inspector { 
                position: fixed; top: 80px; right: 20px; width: 320px; bottom: 20px; 
                background: #1e1e1e; color: #d4d4d4; z-index: 2147483645; 
                font-family: sans-serif; box-shadow: 0 5px 25px rgba(0,0,0,0.4); 
                border-radius: 8px; display: flex; flex-direction: column; 
                animation: vw-slide 0.3s; pointer-events: none; opacity: 0; transition: opacity 0.3s; 
                overflow: hidden; border: 1px solid #333;
            }
            #vw-inspector.visible { pointer-events: auto; opacity: 1; }
            @keyframes vw-slide { from { transform: translateX(20px); opacity:0; } to { transform: translateX(0); opacity:1; } }
            
            .vw-insp-head { padding: 12px 15px; background: #252526; border-bottom: 1px solid #333; font-weight: bold; color: #aaa; font-size: 12px; letter-spacing: 1px; }
            .vw-insp-content { padding: 15px; overflow-y: auto; flex: 1; min-height: 200px; }
            .vw-insp-title { font-size: 16px; color: #fff; margin: 0 0 15px 0; font-weight: 600; border-bottom: 1px solid #333; padding-bottom: 10px; }
            .vw-insp-sect { margin-bottom: 15px; }
            .vw-insp-lbl { color: #569cd6; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
            .vw-insp-txt { font-size: 13px; line-height: 1.5; color: #ccc; }

            /* Chat Specifics */
            .vw-chat-container { 
                height: 250px; display: flex; flex-direction: column; 
                border-top: 1px solid #333; background: #252526;
            }
            .vw-chat-messages { 
                flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;
            }
            .vw-msg { 
                padding: 8px 12px; border-radius: 15px; font-size: 12px; max-width: 85%; line-height: 1.4; 
                animation: vw-pop 0.2s; word-wrap: break-word;
            }
            .vw-msg.loading { color: #aaa; font-style: italic; background: transparent; }
            @keyframes vw-pop { from { transform: scale(0.9); opacity:0; } to { transform: scale(1); opacity:1; } }
            .vw-msg.bot { background: #3e3e42; color: #eee; align-self: flex-start; border-bottom-left-radius: 2px; }
            .vw-msg.user { background: #007acc; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
            
            .vw-chat-input-area { 
                padding: 10px; display: flex; gap: 5px; background: #1e1e1e; border-top: 1px solid #333; 
            }
            #vw-chat-input { 
                flex: 1; background: #2d2d30; border: 1px solid #3e3e42; color: white; 
                padding: 8px; border-radius: 4px; outline: none; font-size: 12px;
            }
            #vw-chat-input:focus { border-color: #007acc; }
            #vw-chat-send { 
                background: #007acc; color: white; border: none; padding: 0 12px; 
                border-radius: 4px; cursor: pointer; 
            }
            #vw-chat-send:hover { background: #005a9e; }
        `;
        document.head.appendChild(style);
    }

    _initEditMode() {
        this._initScrolly(); 
        document.body.classList.add('vw-editing');
        document.querySelectorAll('.vw-card div:last-child').forEach(el => {
            el.contentEditable = "true";
            el.style.border = "1px dashed #ccc";
            el.style.padding = "5px";
            el.style.backgroundColor = "#fffef0";
            el.style.outline = "none";
        });
        const rightPane = document.getElementById('vw-right');
        const addBtn = document.createElement('button');
        addBtn.innerText = "+ Add New Step";
        addBtn.className = "vw-action-btn";
        addBtn.onclick = () => this._addNewStep();
        rightPane.prepend(addBtn);
    }

    _addNewStep() {
        const newStep = { step_id: `step_${Date.now()}`, text: "New step description...", targets: {}, actions: ['highlight'] };
        this.steps.push(newStep);
        this._teardown(); 
        this._initEditMode();
        setTimeout(() => {
            const right = document.getElementById('vw-right');
            right.scrollTop = right.scrollHeight;
        }, 100);
    }

    _saveFromDOM() {
        const cards = document.querySelectorAll('.vw-card');
        if (cards.length === 0) return; 
        cards.forEach((card, i) => { if (this.steps[i]) this.steps[i].text = card.lastChild.innerText; });
        console.log("✅ Changes Saved:", this.steps);
    }

    exportConfig() {
        if (this.mode === 'edit') this._saveFromDOM();
        const dataStr = "const RAW_STEPS = " + JSON.stringify(this.steps, null, 4) + ";";
        const blob = new Blob([dataStr], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "content.js"; 
        document.body.appendChild(a);
        a.click(); document.body.removeChild(a);
    }

    _teardown() {
        if (this.scrollyObserver) this.scrollyObserver.disconnect();
        const left = document.getElementById('vw-left');
        const right = document.getElementById('vw-right');
        const wrapper = document.getElementById('vw-scale');

        if (this.originalNodes.length > 0) {
            this.originalNodes.forEach(n => { if(n.style) n.style.transform = ''; document.body.appendChild(n); });
        } else if (wrapper) { while(wrapper.firstChild) document.body.appendChild(wrapper.firstChild); }

        if(left) left.remove(); if(right) right.remove();
        document.body.classList.remove('vw-scrolly-active');

        const insp = document.getElementById('vw-inspector');
        if (insp) insp.classList.remove('visible');
        if (this.exploreHandler) document.body.removeEventListener('mousemove', this.exploreHandler);

        document.querySelectorAll('.vw-dim, .vw-highlight, .vw-ring').forEach(el => {
            el.classList.remove('vw-dim', 'vw-highlight', 'vw-ring');
        });
    }

    _initScrolly() {
        document.body.classList.add('vw-scrolly-active');
        this.originalNodes = Array.from(document.body.children).filter(n => !n.id.startsWith('vw-') && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE');
        const left = document.createElement('div'); left.id = 'vw-left';
        const wrapper = document.createElement('div'); wrapper.id = 'vw-scale';
        const right = document.createElement('div'); right.id = 'vw-right';

        this.originalNodes.forEach(n => wrapper.appendChild(n));
        left.appendChild(wrapper); document.body.appendChild(left); document.body.appendChild(right);

        this.steps.forEach((step, i) => {
            const div = document.createElement('div'); div.className = 'vw-step'; div.dataset.index = i;
            div.innerHTML = `<div class="vw-card"><div class="vw-badge">Step ${i+1}</div><div>${step.text}</div></div>`;
            right.appendChild(div);
        });
        const endPad = document.createElement('div'); endPad.style.height = "50vh"; right.appendChild(endPad);

        const fit = () => {
            wrapper.style.transform = 'scale(1)';
            const scale = Math.min(left.offsetWidth / wrapper.scrollWidth, left.offsetHeight / wrapper.scrollHeight) * 0.90;
            wrapper.style.transform = `scale(${scale})`;
        };
        setTimeout(fit, 100); window.addEventListener('resize', fit);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    document.querySelectorAll('.vw-card').forEach(c => c.classList.remove('active'));
                    entry.target.querySelector('.vw-card').classList.add('active');
                    const step = this.steps[entry.target.dataset.index];
                    const svg = document.querySelector('svg');
                    if (!svg) return;
                    svg.querySelectorAll('*').forEach(el => el.classList.remove('vw-dim', 'vw-highlight'));
                    if (step.actions.includes('highlight')) {
                        svg.querySelectorAll('g, rect, path, circle, text').forEach(el => el.classList.add('vw-dim'));
                        const sel = this._resolveSelector(step.targets);
                        if (sel) {
                            svg.querySelectorAll(sel).forEach(el => {
                                el.classList.remove('vw-dim'); el.classList.add('vw-highlight');
                                let p = el.parentNode; while(p && p !== svg) { p.classList.remove('vw-dim'); p = p.parentNode; }
                            });
                        }
                    }
                }
            });
        }, { root: right, threshold: 0.6 });
        document.querySelectorAll('.vw-step').forEach(el => observer.observe(el));
        this.scrollyObserver = observer;
    }

    _resolveSelector(targets) {
        if (!targets) return null;
        const priorities = ['view', 'encoding', 'interaction'];
        for (let type of priorities) { if (targets[type]?.candidates?.[0]?.selector) return targets[type].candidates[0].selector; }
        return null;
    }

    _generalizeData(rawSteps) {
        const merged = new Map();
        const getTitle = (c, id) => {
            if (!c || !c.reason) return "Detail: " + id;
            return c.reason.toLowerCase().replace(/^(container for|view of|the)\s+/, '').split(' and ')[0].replace(/\b\w/g, l => l.toUpperCase());
        };
        const categorize = (txt) => {
            const b = { encoding: [], insight: [], interaction: [] };
            (txt.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || []).forEach(s => {
                const l = s.toLowerCase();
                if (l.match(/(hover|click|press)/)) b.interaction.push(s.trim());
                else if (l.match(/(look|spot|compare)/)) b.insight.push(s.trim());
                else b.encoding.push(s.trim());
            });
            return { encoding: b.encoding.join(' '), insight: b.insight.join(' '), interaction: b.interaction.join(' ') };
        };

        rawSteps.forEach(step => {
            let main = step.targets?.view?.candidates?.[0] || step.targets?.encoding?.candidates?.[0];
            let key = main ? main.selector : 'General_Overview';
            if (!merged.has(key)) merged.set(key, { step_id: key, title: key === 'General_Overview' ? 'Overview' : getTitle(main, step.step_id), rawText: '', targets: step.targets, selector: key });
            merged.get(key).rawText += ' ' + step.text;
        });
        return Array.from(merged.values()).map(e => ({ ...e, content: categorize(e.rawText) }));
    }

    _renderToggleBar() {
        if(document.getElementById('vw-toggle-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'vw-toggle-bar';
        let html = `
            <button class="vw-toggle-btn" id="vw-btn-scrolly">Guided Tour</button>
            <button class="vw-toggle-btn" id="vw-btn-explore">Free Exploration</button>
        `;
        if (this.isAuthorMode) {
            html += `
                <div style="width:1px; height:20px; background:#555; margin:0 10px;"></div>
                <button class="vw-toggle-btn" id="vw-btn-edit">✎ Edit Text</button>
                <button class="vw-toggle-btn" id="vw-btn-export">💾 Export</button>
            `;
        }
        html += `<button class="vw-toggle-btn" id="vw-btn-close" style="margin-left:10px; color:#e74c3c;">✕</button>`;
        bar.innerHTML = html;
        document.body.appendChild(bar);
        document.getElementById('vw-btn-scrolly').onclick = () => this.setMode('scrolly');
        document.getElementById('vw-btn-explore').onclick = () => this.setMode('explore');
        document.getElementById('vw-btn-close').onclick = () => { this.setMode('none'); bar.remove(); };
        if (this.isAuthorMode) {
            document.getElementById('vw-btn-edit').onclick = () => this.setMode('edit');
            document.getElementById('vw-btn-export').onclick = () => this.exportConfig();
        }
    }
}

/**
 * Converts an SVG element to a Base64-encoded PNG string.
 */
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

async function semanticInference(svgContent, description,b64Image, apiKey) {

    try{
        let messages=[{"role": "system", "content": `
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
    STRATEGIC NARRATIVE RULES (NEW)
    --------------------------------
    - Relational Logic: Explain how views relate to one another (e.g., if one view filters another, or if a header is shared between two charts).
    - Dual-Encoding Clarity: If a single mark uses multiple channels (e.g., color and size), explain how to interpret them in tandem.
    - Action-Oriented Language: Use active verbs (e.g., "Scan the diagonal," "Follow the color gradient," "Identify clusters") to guide the user's eye.
    - The "Aha" Moment: Include at least one analytical insight that describes a pattern unique to this specific visualization type.

    KEYWORD ANCHORING: You must use specific "mark-based" keywords in your explanation_text to describe data points. Use words like "individual card," "colored dot," "outlined box," or "specific mark." Avoid aggregate terms like "the layout," "the panel," or "the area" when describing data knowledge or visual encodings.
    -------------------------------- PRECISION & ATOMIC TARGETING (CRITICAL) --------------------------------
    - Target the "Atomic" Mark: When explaining visual encodings or data points, do NOT describe the background region or the container. You must focus your description on the specific, smallest visual units that encode data (e.g., the individual dots, bars, cards, or glyphs). - Hierarchy Awareness: If a visualization has elements nested inside regions (like cards inside a container), your text must explicitly refer to the nested elements. Avoid vague language like "this area"; instead use "the individual marks within this area." - Disambiguation: Ensure your explanation allows a downstream system to distinguish between a "set container" (the big shape) and an "element glyph" (the small shape).

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
    - Describe how to interpret patterns (e.g., "A concentration of large marks here indicates...")

    5) INTERACTION KNOWLEDGE
    - Infer and describe supported interactions (e.g., hover, filter, brush, zoom)
    - Explain what tasks these interactions enable and why they are useful

    DO NOT:
    - Combine multiple knowledge categories into a single step
    - Describe low-level SVG or implementation details
    - Treat multiple individual charts as one view

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

    IMPORTANT:
    - Do NOT describe what you intend to explain.
    - Do NOT summarize or label the step.
    - You MUST write the actual explanation text a user would read during onboarding.
    - The explanation_text should be understandable without referencing SVG, code, or system concepts.

    --------------------------------
    INPUT
    --------------------------------
    The SVG code and rendered image will be provided next.

    `},
            {
                "role": "user",
                "content": [
                {"type": "text", "text":`
    ## Composite Visualization Input

    ### SVG
    ${svgContent}

    Analyze the visualization and return ONLY the JSON object described above.

    `},  
    {"type": "image_url", "image_url": {"url": `data:image/png;base64,${b64Image}`}}
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

    try{
        let messages=[{"role": "system", "content": `
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
    - Do NOT return executable code.
    - Output JSON ONLY.

    `},
            {
                "role": "user",
                "content": [
                {"type": "text", "text":`
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

    `}, {"type": "image_url", "image_url": {"url": `data:image/png;base64,${b64Image}`}}
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
                model: "gpt-5", // or "gpt-4" if you have access
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

async function generateDynamicOnboarding(svgContent, description, b64Image, apiKey) {
    // ⚠️ REPLACE THIS WITH YOUR ACTUAL KEY
    if (!apiKey || apiKey.includes('YOUR_OPENAI')) {
        alert("Please configure your OpenAI API Key in the code first.");
        return [];
    }

 
    narrativeData = await semanticInference(svgContent, description, b64Image, apiKey);

    console.log("Narrative Data from LLM:", narrativeData);

    const viewIdList = narrativeData.views.map(view => view.view_id);

    mappingData= await semanticGrounding(svgContent, viewIdList, b64Image, apiKey);

    console.log("Mapping Data from LLM:", mappingData);

    return narrativeData.explanation_steps.map((step, i) => {
        const viewId = step.target_view_id;
        const resolved = mappingData[viewId] || {};
        
        // Action mapping based on knowledge categories
        const actionMap = {
            'structure': ['highlight-multiple'],
            'encoding': ['highlight', 'glow', 'annotation'],
            'data': ['highlight', 'annotation'],
            'analytical': ['highlight', 'trace', 'annotation'],
            'interaction': ['pulse', 'tooltip', 'annotation']
        };

        return {
            step_id: `step_${i + 1}`,
            text: step.explanation_text,
            targets: resolved,
            actions: actionMap[step.step_type] || ['highlight']
        };
    });


}
// ==========================================
// 3. EXTENSION LISTENER
// ==========================================

if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        if (request.action === "GENERATE_AND_LAUNCH") {
            const { description } = request.payload;
            const svgElement = document.querySelector('svg');

            if (!svgElement) {
                alert("No SVG found on this page!");
                return;
            }

            showLoadingToast();

            try {
                // Initialize instance just to get the API Key

                const b64Image = await getSVGAsBitmap(svgElement);
                const tempInstance = new VisWalkthrough({});
                const apiKey = tempInstance.apiKey;

                // 1. Run the live pipeline from your notebook
                const dynamicSteps = await generateDynamicOnboarding(
                    svgElement.outerHTML, 
                    description, 
                    b64Image,
                    apiKey
                );

                removeLoadingToast();

                // 2. Clear old instance and launch new one
                if (window.visWalkthroughInstance) window.visWalkthroughInstance._teardown();
                window.visWalkthroughInstance = new VisWalkthrough({ steps: dynamicSteps });
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

function showLoadingToast() {
    if(document.getElementById('vw-loading-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'vw-loading-toast';
    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; background:#2c3e50; color:white; padding:15px; border-radius:8px; position:fixed; bottom:20px; right:20px; z-index:99999;">
            <div class="vw-spinner" style="width:20px; height:20px; border:3px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
            <div>Analyzing SVG via AI...</div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(toast);
}

function removeLoadingToast() {
    const toast = document.getElementById('vw-loading-toast');
    if (toast) toast.remove();
}