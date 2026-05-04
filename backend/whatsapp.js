const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

let browserContext = null;
let page = null;
let isReady = false;

// ── Session Management ────────────────────────────────────────

const getWhatsAppStatus = () => {
    return {
        initialized: !!browserContext,
        ready: isReady,
        pageUrl: page ? page.url() : null
    };
};

const initWhatsApp = async () => {
    const userDataDir = path.resolve(__dirname, 'whatsapp_session');

    console.log('Initializing WhatsApp Web...');
    browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Must be false to allow user to scan QR
        args: ['--no-sandbox']
    });

    page = await browserContext.newPage();
    await page.goto('https://web.whatsapp.com/');

    console.log('Waiting for WhatsApp Web to load. Please scan QR code if needed.');

    // Wait for the pane-side (the list of chats) which means login is successful
    try {
        await page.waitForSelector('#pane-side', { timeout: 60000 });
        isReady = true;
        console.log('WhatsApp is ready!');
        return { status: 'ready' };
    } catch (e) {
        console.log('Timeout waiting for login. User might need to scan QR code manually from the browser.');
        return { status: 'waiting_for_login' };
    }
};

const validateSession = async () => {
    if (!page || !browserContext) return false;
    try {
        const pane = await page.$('#pane-side');
        return !!pane;
    } catch {
        return false;
    }
};

// ── Message Sending ────────────────────────────────────────────

const sendWhatsAppMessage = async (targetChat, text, mediaPath) => {
    if (!page) {
        throw new Error('WhatsApp is not initialized');
    }

    // Validate session before attempting send
    const sessionValid = await validateSession();
    if (!sessionValid) {
        throw new Error('WhatsApp session is not active. Please re-scan QR code.');
    }

    try {
        console.log(`Searching for chat: ${targetChat}`);

        // Click the search button/icon to open the search panel
        const searchBtnSelectors = [
            'button[aria-label="Search or start new chat"]',
            'span[data-icon="search"]',
            'div[title="Search or start new chat"]'
        ];
        for (const sel of searchBtnSelectors) {
            const el = await page.$(sel);
            if (el) { await el.click(); break; }
        }
        await page.waitForTimeout(500);

        // Type into the search box (always the first contenteditable in the sidebar)
        const searchBox = page.locator('#side div[contenteditable="true"]').first();
        await searchBox.waitFor({ state: 'visible', timeout: 15000 });
        await searchBox.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await searchBox.pressSequentially(targetChat, { delay: 50 });

        // Wait for search results list to appear
        await page.waitForTimeout(2000);

        // Click the first result in the chat list
        const firstResultSelectors = [
            '#pane-side [role="listitem"]:first-child',
            '#pane-side [data-testid="cell-frame-container"]:first-child',
            '#pane-side div[role="row"]:first-child'
        ];
        let clicked = false;
        for (const sel of firstResultSelectors) {
            const el = await page.$(sel);
            if (el) {
                await el.click();
                clicked = true;
                break;
            }
        }
        if (!clicked) {
            // Fallback: press Enter to open the first result
            await page.keyboard.press('Enter');
        }

        // Wait for the chat conversation pane to be visible
        await page.waitForSelector('#main', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // If mediaPath is provided, attach media
        if (mediaPath && fs.existsSync(mediaPath)) {
            console.log(`Attaching media: ${mediaPath}`);

            // Click the attach (paperclip) button inside #main
            const attachButtonSelectors = [
                '#main div[title="Attach"]',
                '#main span[data-icon="attach-menu-plus"]',
                '#main button[aria-label="Attach"]'
            ];
            for (const sel of attachButtonSelectors) {
                const el = await page.$(sel);
                if (el) { await el.click(); break; }
            }
            await page.waitForTimeout(800);

            // Set file on the hidden input
            const fileInputSelector = 'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]';
            const fileInput = await page.$(fileInputSelector);
            if (!fileInput) throw new Error('Could not find file attachment input.');

            await fileInput.setInputFiles(mediaPath);

            // Wait for preview and type caption
            const captionBox = page.locator('#app div[contenteditable="true"]').last();
            await captionBox.waitFor({ state: 'visible', timeout: 15000 });
            if (text) {
                await captionBox.click();
                await captionBox.pressSequentially(text, { delay: 30 });
            }

            // Click the send button
            const sendButtonSelectors = [
                'div[aria-label="Send"]',
                'span[data-icon="send"]',
                'button[aria-label="Send"]'
            ];
            let sent = false;
            for (const sel of sendButtonSelectors) {
                const el = await page.$(sel);
                if (el) { await el.click(); sent = true; break; }
            }
            if (!sent) await page.keyboard.press('Enter');

        } else if (text) {
            // Text-only message — type into the main chat input
            console.log('Sending text message');
            const messageBox = page.locator('#main div[contenteditable="true"]').last();
            await messageBox.waitFor({ state: 'visible', timeout: 15000 });
            await messageBox.click();
            await messageBox.pressSequentially(text, { delay: 30 });
            await page.keyboard.press('Enter');
        } else {
            throw new Error('No text or valid media path provided.');
        }

        console.log('Message sent successfully!');

        // Brief delay to ensure delivery before navigating away
        await page.waitForTimeout(2000);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
};


const focusWhatsAppWindow = async () => {
    if (!page) {
        throw new Error('WhatsApp browser is not running');
    }
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
