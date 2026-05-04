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
        // Find the search bar and search for the target chat
        console.log(`Searching for chat: ${targetChat}`);

        // Wait for search box to be visible
        const searchBoxSelector = 'div[contenteditable="true"]';
        const searchBox = page.locator(searchBoxSelector).first();

        await searchBox.waitFor({ state: 'visible', timeout: 15000 });
        await searchBox.click();

        // Clear previous search
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');

        // Type the target chat name or number
        await searchBox.fill(targetChat);
        await page.waitForTimeout(1500); // Wait for search results to update

        // Press enter to select the first matching chat
        await page.keyboard.press('Enter');

        // Wait a bit for the chat to open
        await page.waitForTimeout(2000);

        // If mediaPath is provided, attach the image
        if (mediaPath && fs.existsSync(mediaPath)) {
            console.log(`Attaching media: ${mediaPath}`);
            const attachButtonSelector = 'div[title="Attach"]';
            await page.waitForSelector(attachButtonSelector);
            await page.click(attachButtonSelector);

            // Wait for the attachment options
            await page.waitForTimeout(1000);

            // Image/Video input
            const fileInputSelector = 'input[accept="image/*,video/mp4,video/3gpp,video/quicktime"]';
            const fileInput = await page.$(fileInputSelector);
            if (fileInput) {
                await fileInput.setInputFiles(mediaPath);

                // Wait for image preview screen and caption box
                const captionBox = page.locator('div[contenteditable="true"]').last();
                await captionBox.waitFor({ state: 'visible', timeout: 15000 });

                if (text) {
                    await captionBox.fill(text);
                }

                // Click send button
                const sendButtonSelector = 'div[aria-label="Send"]';
                await page.waitForSelector(sendButtonSelector);
                await page.click(sendButtonSelector);

            } else {
                throw new Error("Could not find file attachment input.");
            }
        } else if (text) {
            // Text only message
            console.log(`Sending text message`);
            const messageBox = page.locator('div[contenteditable="true"]').last();
            await messageBox.waitFor({ state: 'visible', timeout: 15000 });
            await messageBox.fill(text);
            await page.keyboard.press('Enter');
        }

        console.log('Message sent successfully!');

        // Small delay to ensure message goes through
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
