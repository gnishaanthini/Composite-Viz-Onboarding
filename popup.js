const apiKeyInput = document.getElementById('apiKeyInput');
const rememberKey = document.getElementById('rememberKey');
const settingsStatus = document.getElementById('settingsStatus');
const settingsReady = chrome.storage.local.get('openaiApiKey').then(({ openaiApiKey }) => {
    apiKeyInput.value = openaiApiKey || '';
    rememberKey.checked = Boolean(openaiApiKey);
}).catch(() => {
    settingsStatus.textContent = 'Could not load saved key. Enter it manually.';
});

document.getElementById('forgetKeyBtn').addEventListener('click', async () => {
    await settingsReady;
    try {
        await chrome.storage.local.remove('openaiApiKey');
        apiKeyInput.value = '';
        rememberKey.checked = false;
        settingsStatus.textContent = 'Saved key removed. Refresh visualization tabs to clear keys already in use.';
    } catch {
        settingsStatus.textContent = 'Could not remove saved key. Please try again.';
    }
});

document.getElementById('generateBtn').addEventListener('click', async () => {
    await settingsReady;
    const apiKey = apiKeyInput.value.trim();
    const desc = document.getElementById('descInput').value.trim();
    const fileInput = document.getElementById('fileInput');
    const btn = document.getElementById('generateBtn');

    // 1. Basic Validation
    if (!apiKey) {
        alert('Please enter your OpenAI API key.');
        return;
    }
    if (!desc) {
        alert("Please provide a description of the visualization.");
        return;
    }

    // 2. UI Feedback
    btn.innerText = "Reading File...";
    btn.disabled = true;

    try {
        if (rememberKey.checked) {
            await chrome.storage.local.set({ openaiApiKey: apiKey });
        } else {
            await chrome.storage.local.remove('openaiApiKey');
        }
        // 3. Read File Content (if a file was selected)
        let codeContent = "";
        if (fileInput.files.length > 0) {
            codeContent = await readFileAsText(fileInput.files[0]);
        }

        btn.innerText = "Processing...";

        // 4. Send Payload
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        chrome.tabs.sendMessage(tab.id, { 
            action: "GENERATE_AND_LAUNCH",
            payload: {
                description: desc,
                apiKey,
                code: codeContent // This is now the actual text from the file
            }
        });

        // 5. Close popup
        setTimeout(() => window.close(), 500);

    } catch (e) {
        console.error(e);
        btn.innerText = "Error: See Console";
        btn.style.background = "#e74c3c";
        // Reset button after 2s
        setTimeout(() => {
            btn.disabled = false;
            btn.innerText = "Generate Onboarding";
            btn.style.background = "#3498db";
        }, 2000);
    }
});

// Helper: Wraps FileReader in a Promise for clean async/await usage
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}
