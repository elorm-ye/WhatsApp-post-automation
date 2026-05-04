const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const {
    initDb, addPost, getPostById, getPosts, getPendingPosts,
    getRetryablePosts, updatePostStatus, incrementRetryCount,
    updatePost, deletePost, getStats
} = require('./db');
const { initWhatsApp, sendWhatsAppMessage, getWhatsAppStatus, validateSession, focusWhatsAppWindow } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3001;

// ── App State ─────────────────────────────────────────────────

let autoMode = false;       // Manual mode by default for safety
let lastSendTime = 0;       // Rate limiting: track last send timestamp
const RATE_LIMIT_MS = 30000; // 30 seconds between posts
const MAX_RETRIES = 3;

// ── Middleware ─────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Serve uploaded files statically
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ── Rate Limiter ──────────────────────────────────────────────

const canSendNow = () => {
    const now = Date.now();
    return (now - lastSendTime) >= RATE_LIMIT_MS;
};

const recordSend = () => {
    lastSendTime = Date.now();
};

// ── Post Execution with Retry ─────────────────────────────────

const executePost = async (post) => {
    if (!canSendNow()) {
        console.log(`Rate limited. Skipping post ${post.id} for now.`);
        return { success: false, rateLimited: true };
    }

    try {
        await updatePostStatus(post.id, 'pending');
        await sendWhatsAppMessage(post.target_chat, post.content_text, post.media_path);
        await updatePostStatus(post.id, 'posted');
        recordSend();
        console.log(`✅ Post ${post.id} sent successfully.`);

        // Handle weekly repeat: clone the post for next week
        if (post.repeat_weekly) {
            const nextTime = new Date(post.scheduled_time);
            nextTime.setDate(nextTime.getDate() + 7);
            await addPost(
                post.content_text, post.media_path, post.target_chat,
                nextTime.toISOString(), post.platform, 'scheduled', 1
            );
            console.log(`🔁 Repeat post created for ${nextTime.toISOString()}`);
        }

        return { success: true };
    } catch (err) {
        console.error(`❌ Failed to send post ${post.id}:`, err.message);
        await incrementRetryCount(post.id);

        const newRetryCount = (post.retry_count || 0) + 1;
        if (newRetryCount >= MAX_RETRIES) {
            await updatePostStatus(post.id, 'failed');
            console.log(`💀 Post ${post.id} permanently failed after ${MAX_RETRIES} retries.`);
        } else {
            await updatePostStatus(post.id, 'scheduled');
            const backoffSec = 30 * Math.pow(2, newRetryCount);
            console.log(`🔄 Post ${post.id} will retry. Attempt ${newRetryCount}/${MAX_RETRIES}. Backoff: ${backoffSec}s`);
        }

        return { success: false, error: err.message };
    }
};

// ── Server Initialization ─────────────────────────────────────

const startServer = async () => {
    try {
        await initDb();
        console.log('📦 Database initialized.');

        // WhatsApp initialization runs in background
        initWhatsApp().then(status => {
            console.log('📱 WhatsApp status:', status);
        }).catch(err => {
            console.error('Failed to init WhatsApp:', err);
        });

        // ── Cron Scheduler: Every minute ──────────────────────
        cron.schedule('* * * * *', async () => {
            const now = new Date().toISOString();
            console.log(`⏰ Scheduler tick: ${now}`);

            try {
                const posts = await getPendingPosts(now);

                if (posts.length === 0) return;

                console.log(`📋 Found ${posts.length} post(s) ready to process.`);

                for (const post of posts) {
                    // Check exponential backoff timing for retried posts
                    if (post.retry_count > 0) {
                        const backoffMs = 30000 * Math.pow(2, post.retry_count);
                        const postTime = new Date(post.scheduled_time).getTime();
                        if (Date.now() - postTime < backoffMs) {
                            console.log(`⏳ Post ${post.id} in backoff period. Skipping.`);
                            continue;
                        }
                    }

                    if (autoMode) {
                        await executePost(post);
                    } else {
                        // In manual mode, just mark as pending so the UI shows the "Send Now" button prominently
                        await updatePostStatus(post.id, 'pending');
                        console.log(`🔔 Post ${post.id} is ready. Awaiting manual trigger.`);
                    }
                }
            } catch (err) {
                console.error('Error in cron job:', err);
            }
        });

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

// ═══════════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════════

// ── Stats (must be before parameterized routes) ─────────────

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Settings / Status (must be before parameterized routes) ─

app.get('/api/settings', (req, res) => {
    const waStatus = getWhatsAppStatus();
    res.json({
        autoMode,
        rateLimitMs: RATE_LIMIT_MS,
        maxRetries: MAX_RETRIES,
        whatsapp: waStatus
    });
});

app.post('/api/settings', (req, res) => {
    if (req.body.autoMode !== undefined) {
        autoMode = !!req.body.autoMode;
        console.log(`⚙️ Auto-mode set to: ${autoMode}`);
    }
    res.json({ autoMode });
});

app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        const sessionValid = await validateSession();
        res.json({ ...status, sessionValid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp/focus', async (req, res) => {
    try {
        const result = await focusWhatsAppWindow();
        res.json({ message: 'WhatsApp browser brought to front', ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Posts CRUD ──────────────────────────────────────────────

// Get all posts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await getPosts();
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single post
app.get('/api/posts/:id', async (req, res) => {
    try {
        const post = await getPostById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new post (scheduled or draft)
app.post('/api/posts', upload.single('media'), async (req, res) => {
    try {
        const { text, targetChat, scheduledTime, platform, status, repeatWeekly } = req.body;
        const mediaPath = req.file ? req.file.path : null;

        // Drafts don't need scheduledTime or targetChat
        const isDraft = status === 'draft';

        if (!isDraft && (!targetChat || (!text && !mediaPath) || !scheduledTime)) {
            return res.status(400).json({ error: 'Missing required fields (targetChat, text/media, scheduledTime)' });
        }

        const id = await addPost(
            text || null,
            mediaPath,
            targetChat || null,
            scheduledTime || null,
            platform || 'whatsapp',
            isDraft ? 'draft' : 'scheduled',
            repeatWeekly ? 1 : 0
        );
        res.status(201).json({ id, message: isDraft ? 'Draft saved' : 'Post scheduled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a post
app.patch('/api/posts/:id', upload.single('media'), async (req, res) => {
    try {
        const { id } = req.params;
        const fields = { ...req.body };
        if (req.file) {
            fields.media_path = req.file.path;
        }
        // Map frontend field names to db column names
        if (fields.text !== undefined) {
            fields.content_text = fields.text;
            delete fields.text;
        }
        if (fields.targetChat !== undefined) {
            fields.target_chat = fields.targetChat;
            delete fields.targetChat;
        }
        if (fields.scheduledTime !== undefined) {
            fields.scheduled_time = fields.scheduledTime;
            delete fields.scheduledTime;
        }
        if (fields.repeatWeekly !== undefined) {
            fields.repeat_weekly = fields.repeatWeekly ? 1 : 0;
            delete fields.repeatWeekly;
        }

        await updatePost(id, fields);
        res.json({ message: 'Post updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a post (soft delete)
app.delete('/api/posts/:id', async (req, res) => {
    try {
        await deletePost(req.params.id);
        res.json({ message: 'Post deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Manual Trigger ──────────────────────────────────────────

app.post('/api/posts/:id/send', async (req, res) => {
    try {
        const post = await getPostById(req.params.id);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (!canSendNow()) {
            const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSendTime)) / 1000);
            return res.status(429).json({
                error: `Rate limited. Please wait ${waitSec} seconds before sending another message.`
            });
        }

        const result = await executePost(post);
        if (result.success) {
            res.json({ message: 'Post sent successfully' });
        } else {
            res.status(500).json({ error: result.error || 'Failed to send' });
        }
    } catch (err) {
        console.error('Manual send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Stats, settings, and whatsapp status routes are registered above (before parameterized routes)

startServer();
