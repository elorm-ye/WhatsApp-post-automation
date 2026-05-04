# WhatsApp Post Automation

A full-stack application that allows you to automate and schedule WhatsApp messages with text and media. It features a React (Vite) frontend for managing scheduled posts and an Express/Node.js backend leveraging `playwright` for WhatsApp Web automation.

## Features

- **Schedule Posts:** Create, schedule, and manage WhatsApp messages to be sent at specific times.
- **Media Support:** Attach images or videos to your scheduled WhatsApp messages.
- **Recurring Posts:** Set posts to repeat weekly.
- **Drafts:** Save messages as drafts to edit or schedule later.
- **Dashboard:** A dynamic interface to view pending, posted, failed, and drafted messages.
- **Automated Execution:** The backend automatically manages the session and sends messages via a headless (or headed) browser instance of WhatsApp Web.

## Tech Stack

- **Frontend:** React, Vite, React Router, Axios, CSS
- **Backend:** Node.js, Express, Playwright, SQLite3, node-cron, Multer

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/elorm-ye/WhatsApp-post-automation.git
   cd WhatsApp-post-automation
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   npm install
   npm start
   ```
   *Note: On the first run, the server will open a browser window for WhatsApp Web. You must scan the QR code with your phone to authenticate.*

3. **Frontend Setup:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173/` (or the port specified by Vite).

## How It Works

1. The backend initializes a SQLite database to store your posts and runs a `node-cron` job every minute to check for pending posts.
2. WhatsApp authentication is maintained via a persistent session directory (`whatsapp_session/`).
3. You can schedule a post via the React frontend.
4. When the scheduled time arrives, the backend uses Playwright to interact with the WhatsApp Web interface, selects the target chat, types the message, uploads any attached media, and sends the post.

## License

This project is licensed under the MIT License.
