const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_text TEXT,
                    media_path TEXT,
                    target_chat TEXT,
                    scheduled_time TEXT,
                    platform TEXT DEFAULT 'whatsapp',
                    status TEXT DEFAULT 'scheduled',
                    retry_count INTEGER DEFAULT 0,
                    repeat_weekly INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `, (err) => {
                if (err) return reject(err);

                // Migrate: add missing columns if table already existed
                const migrations = [
                    "ALTER TABLE posts ADD COLUMN retry_count INTEGER DEFAULT 0",
                    "ALTER TABLE posts ADD COLUMN repeat_weekly INTEGER DEFAULT 0",
                    "ALTER TABLE posts ADD COLUMN created_at TEXT"
                ];

                let completed = 0;
                for (const sql of migrations) {
                    db.run(sql, (migErr) => {
                        // Ignore "duplicate column" errors from migrations
                        if (migErr && !migErr.message.includes('duplicate column')) {
                            console.warn('Migration warning:', migErr.message);
                        }
                        completed++;
                        if (completed === migrations.length) resolve();
                    });
                }
            });
        });
    });
};

// ── CRUD Operations ──────────────────────────────────────────────

const addPost = (text, mediaPath, targetChat, scheduledTime, platform = 'whatsapp', status = 'scheduled', repeatWeekly = 0) => {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            `INSERT INTO posts (content_text, media_path, target_chat, scheduled_time, platform, status, repeat_weekly, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        );
        stmt.run(text, mediaPath, targetChat, scheduledTime, platform, status, repeatWeekly ? 1 : 0, function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
        stmt.finalize();
    });
};

const getPostById = (id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM posts WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const getPosts = (includeDeleted = false) => {
    return new Promise((resolve, reject) => {
        const sql = includeDeleted
            ? 'SELECT * FROM posts ORDER BY scheduled_time DESC'
            : "SELECT * FROM posts WHERE status != 'deleted' ORDER BY scheduled_time DESC";
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const getPendingPosts = (currentTime) => {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT * FROM posts WHERE scheduled_time <= ? AND status IN ('scheduled', 'pending') ORDER BY scheduled_time ASC",
            [currentTime],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
};

const getRetryablePosts = () => {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT * FROM posts WHERE status = 'failed' AND retry_count < 3 ORDER BY scheduled_time ASC",
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
};

const updatePostStatus = (id, status) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE posts SET status = ? WHERE id = ?', [status, id], function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

const incrementRetryCount = (id) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE posts SET retry_count = retry_count + 1 WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

const updatePost = (id, fields) => {
    return new Promise((resolve, reject) => {
        const allowed = ['content_text', 'media_path', 'target_chat', 'scheduled_time', 'platform', 'status', 'repeat_weekly'];
        const updates = [];
        const values = [];

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(fields[key]);
            }
        }

        if (updates.length === 0) return resolve();

        values.push(id);
        db.run(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`, values, function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

const deletePost = (id) => {
    return new Promise((resolve, reject) => {
        db.run("UPDATE posts SET status = 'deleted' WHERE id = ?", [id], function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

// ── Statistics ───────────────────────────────────────────────────

const getStats = () => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        db.all(
            "SELECT status, COUNT(*) as count FROM posts WHERE status != 'deleted' GROUP BY status",
            [],
            (err, rows) => {
                if (err) return reject(err);

                const stats = {
                    total: 0,
                    scheduled: 0,
                    pending: 0,
                    posted: 0,
                    failed: 0,
                    draft: 0,
                    postedToday: 0
                };

                for (const row of rows) {
                    stats[row.status] = row.count;
                    stats.total += row.count;
                }

                // Count posts sent today
                db.get(
                    "SELECT COUNT(*) as count FROM posts WHERE status = 'posted' AND scheduled_time >= ?",
                    [todayISO],
                    (err2, row2) => {
                        if (err2) return reject(err2);
                        stats.postedToday = row2 ? row2.count : 0;
                        resolve(stats);
                    }
                );
            }
        );
    });
};

module.exports = {
    initDb,
    addPost,
    getPostById,
    getPosts,
    getPendingPosts,
    getRetryablePosts,
    updatePostStatus,
    incrementRetryCount,
    updatePost,
    deletePost,
    getStats
};
