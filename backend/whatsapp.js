const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

let browserContext = null;
let page = null;
let isReady = false;

// ── Session Management ────────────────────────────────────────

const getWhatsAppStatus = () => ({
    initialized: !!browserContext,
    ready: isReady,
    pageUrl: page ? page.url() : null
});

const initWhatsApp = async () => {
    const userDataDir = path.resolve(__dirname, 'whatsapp_session');

    console.log('Initializing WhatsApp Web...');
    browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--no-sandbox', '--disable-gpu'],
        viewport: { width: 1280, height: 800 }
    });

    // Reuse existing page or open a new one
    const pages = browserContext.pages();
    page = pages.length > 0 ? pages[0] : await browserContext.newPage();

    if (!page.url().includes('web.whatsapp.com')) {
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    }

    console.log('Waiting for WhatsApp Web to load. Please scan QR code if needed.');

    try {
        // Wait up to 90s for the app shell to be ready
        await page.waitForSelector('[data-testid="chat-list-search"]', { timeout: 90000 });
        isReady = true;
        console.log('✅ WhatsApp is ready!');
        return { status: 'ready' };
    } catch {
        try {
            // Fallback selector for older WhatsApp Web versions
            await page.waitForSelector('#side', { timeout: 30000 });
            isReady = true;
            console.log('✅ WhatsApp is ready (fallback)!');
            return { status: 'ready' };
        } catch {
            console.log('⚠️ Timeout waiting for login. User may need to scan QR code.');
            return { status: 'waiting_for_login' };
        }
    }
};

const validateSession = async () => {
    if (!page || !browserContext) return false;
    try {
        // Check for any of the known "logged in" markers
        const markers = [
            '[data-testid="chat-list-search"]',
            '#side',
            '#pane-side'
        ];
        for (const sel of markers) {
            const el = await page.$(sel);
            if (el) return true;
        }
        return false;
    } catch {
        return false;
    }
};

// ── Helper: find the first visible element from a list of selectors ──

const findElement = async (selectors, context = page) => {
    for (const sel of selectors) {
        try {
            const el = await context.$(sel);
            if (el) {
                const visible = await el.isVisible();
                if (visible) return el;
            }
        } catch { /* skip */ }
    }
    return null;
};

// ── Message Sending ────────────────────────────────────────────

const sendWhatsAppMessage = async (targetChat, text, mediaPath) => {
    if (!page) throw new Error('WhatsApp is not initialized');

    const sessionValid = await validateSession();
    if (!sessionValid) throw new Error('WhatsApp session is not active. Please re-scan QR code.');

    // Make sure our page is in front
    await page.bringToFront();

    try {
        // ── Step 1: Open the search box via keyboard shortcut ─────────
        console.log(`🔍 Searching for chat: "${targetChat}"`);

        // Ctrl+F is WhatsApp Web's native search shortcut — most reliable method
        await page.keyboard.press('Control+f');
        await page.waitForTimeout(800);

        // Find the active/focused search input — try multiple strategies
        let searchBox = null;

        // Strategy A: look for a focused contenteditable anywhere on the page
        const focusedEditable = await page.evaluateHandle(() => document.activeElement);
        const tag = await page.evaluate(el => el?.tagName, focusedEditable);
        const ce = await page.evaluate(el => el?.contentEditable, focusedEditable);
        if (tag && ce === 'true') {
            searchBox = page.locator(':focus');
        }

        // Strategy B: try known selectors with short timeouts
        if (!searchBox) {
            const searchInputSelectors = [
                'div[aria-label="Search input textbox"]',
                'div[role="textbox"][aria-label*="Search"]',
                '[data-testid="chat-list-search"] div[contenteditable="true"]',
                'div[data-testid="search-input-container"] div[contenteditable="true"]',
                '#side div[contenteditable="true"]',
            ];
            for (const sel of searchInputSelectors) {
                try {
                    const loc = page.locator(sel).first();
                    await loc.waitFor({ state: 'visible', timeout: 3000 });
                    searchBox = loc;
                    break;
                } catch { /* try next */ }
            }
        }

        // Strategy C: click the search icon then grab any newly-visible contenteditable
        if (!searchBox) {
            const searchOpeners = [
                'span[data-icon="search"]',
                '[data-icon="search"]',
                'button[aria-label="Search or start new chat"]',
                'div[title="Search or start new chat"]',
                '[data-testid="chat-list-search"]',
            ];
            for (const sel of searchOpeners) {
                const el = await page.$(sel);
                if (el) { await el.click(); await page.waitForTimeout(600); break; }
            }
            // Now grab the first visible contenteditable in the sidebar
            try {
                const loc = page.locator('#side div[contenteditable="true"]').first();
                await loc.waitFor({ state: 'visible', timeout: 5000 });
                searchBox = loc;
            } catch { /* still not found */ }
        }

        // Strategy D: last resort — any visible contenteditable on the page
        if (!searchBox) {
            try {
                const allEditables = page.locator('div[contenteditable="true"]');
                const count = await allEditables.count();
                console.log(`🔎 Found ${count} contenteditable elements on page`);
                if (count > 0) searchBox = allEditables.first();
            } catch { /* give up */ }
        }

        if (!searchBox) throw new Error('Could not find the WhatsApp search box. Make sure WhatsApp Web is open and logged in.');

        // Clear and type the chat name
        await searchBox.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        await searchBox.pressSequentially(targetChat, { delay: 60 });

        // Wait for search results to render
        await page.waitForTimeout(2500);

        // ── Step 2: Click the first chat result ───────────────────────
        const resultSelectors = [
            '[data-testid="cell-frame-container"]',
            '#pane-side [role="listitem"]',
            '#pane-side [role="row"]',
            '#pane-side li',
            '#pane-side div[tabindex="-1"]'
        ];

        let chatClicked = false;
        for (const sel of resultSelectors) {
            try {
                const el = await page.$(sel);
                if (el) {
                    await el.click();
                    chatClicked = true;
                    break;
                }
            } catch { /* try next */ }
        }

        if (!chatClicked) {
            console.log('⚠️ Could not click a result — pressing Enter as fallback.');
            await page.keyboard.press('Enter');
        }

        // ── Step 3: Wait for the chat window (#main) to open ──────────
        await page.waitForSelector('#main', { timeout: 12000 });
        await page.waitForTimeout(1200);

        // ── Step 4: Send the message ───────────────────────────────────
        if (mediaPath && fs.existsSync(mediaPath)) {
            // ── Media message ──
            console.log(`📎 Attaching media: ${mediaPath}`);

            const attachBtns = [
                '#main div[title="Attach"]',
                '#main [data-testid="clip"]',
                '#main span[data-icon="attach-menu-plus"]',
                '#main button[aria-label="Attach"]'
            ];
            const attachBtn = await findElement(attachBtns);
            if (!attachBtn) throw new Error('Could not find Attach button.');
            await attachBtn.click();
            await page.waitForTimeout(800);

            // Find the hidden file input
            const fileInput = await page.$('input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]');
            if (!fileInput) throw new Error('Could not find file attachment input.');
            await fileInput.setInputFiles(mediaPath);

            // Wait for media preview
            await page.waitForTimeout(2000);

            // Type caption if provided
            if (text) {
                const captionSelectors = [
                    '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
                    'div[aria-label="Add a caption…"]',
                    '#app div[contenteditable="true"]:last-of-type'
                ];
                for (const sel of captionSelectors) {
                    try {
                        const loc = page.locator(sel);
                        await loc.waitFor({ state: 'visible', timeout: 5000 });
                        await loc.click();
                        await loc.pressSequentially(text, { delay: 30 });
                        break;
                    } catch { /* try next */ }
                }
            }

            // Click send
            const sendBtns = [
                '[data-testid="send"]',
                'div[aria-label="Send"]',
                'span[data-icon="send"]',
                'button[aria-label="Send"]'
            ];
            const sendBtn = await findElement(sendBtns);
            if (sendBtn) {
                await sendBtn.click();
            } else {
                await page.keyboard.press('Enter');
            }

        } else if (text) {
            // ── Text-only message ──
            console.log('💬 Sending text message');

            const msgBoxSelectors = [
                '#main div[aria-label="Type a message"]',
                '#main div[data-testid="conversation-compose-box-input"]',
                '#main footer div[contenteditable="true"]',
                '#main div[contenteditable="true"][aria-label]',
                '#main div[contenteditable="true"]'
            ];

            let msgBox = null;
            for (const sel of msgBoxSelectors) {
                try {
                    const loc = page.locator(sel).last();
                    await loc.waitFor({ state: 'visible', timeout: 5000 });
                    msgBox = loc;
                    break;
                } catch { /* try next */ }
            }

            if (!msgBox) throw new Error('Could not find the message input box.');

            await msgBox.click();
            await msgBox.pressSequentially(text, { delay: 40 });

            // IMPORTANT: Press Escape first to dismiss any emoji/sticker autocomplete popup
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);

            // Click the send button — do NOT use Enter (it confirms autocomplete suggestions)
            const sendBtns = [
                '#main [data-testid="send"]',
                '#main div[aria-label="Send"]',
                '#main span[data-icon="send"]',
                '#main button[aria-label="Send"]'
            ];
            const sendBtn = await findElement(sendBtns);
            if (sendBtn) {
                await sendBtn.click();
            } else {
                // Last resort fallback — Escape should have dismissed any popup already
                await page.keyboard.press('Enter');
            }

        } else {
            throw new Error('No text or valid media path provided.');
        }

        console.log('✅ Message sent successfully!');
        await page.waitForTimeout(2000);
        return true;

    } catch (error) {
        console.error('❌ Error sending WhatsApp message:', error.message);
        throw error;
    }
};

const focusWhatsAppWindow = async () => {
    if (!page) throw new Error('WhatsApp browser is not running');
    await page.bringToFront();
    return { focused: true, url: page.url() };
};

module.exports = {
    initWhatsApp,
    sendWhatsAppMessage,
    getWhatsAppStatus,
    validateSession,
    focusWhatsAppWindow
};
