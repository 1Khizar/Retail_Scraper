# Retail Scraper (Realtor.com)

A premium, cyberpunk-styled Chrome extension for data scraping from Realtor.com. This project features a robust Next.js backend, centralized user management, secure authentication, and a high-performance scraping engine.

## 🚀 Features

### 🛠️ Chrome Extension
- **Cyberpunk UI**: A futuristic, animated interface with a high-tech aesthetic.
- **Secure Authentication**: JWT-based login system integrated with the backend API.
- **High-Performance Scraper**: Automatically collects Agent Name, Phone, Address, and Profile URL from Realtor.com search results.
- **Smart Pagination**: Automatically navigates through up to 50 pages of results (hardcoded safety limit).
- **In-Page Overlay**: Real-time progress monitoring through a custom cyberpunk-themed dashboard.
- **CSV Export**: Instant download of collected data once the scraping process completes.

### 🖥️ Backend System (Next.js 15)
- **Admin Dashboard**: Comprehensive panel to monitor system stats and manage users.
- **User Approval Workflow**: New registrations require admin approval before they can access the scraper.
- **Secure API**: Protected routes for scraping logs and user authentication.
- **Database (Prisma + PostgreSQL)**: Efficient storage for user profiles and scraping activity.

## 🏗️ Technology Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4
- **Database**: PostgreSQL with Prisma ORM
- **Extension**: Manifest V3, Vanilla JavaScript
- **Styling**: Cyberpunk-inspired custom CSS with glassmorphism effects

## ⚙️ Setup Instructions

### 1. Database Setup
1.  Ensure **PostgreSQL** is installed and running.
2.  Create a database named `retail_scraper`.
3.  Configure your environment variables in `backend/.env`.

### 2. Backend Setup
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed  # Creates default admin: admin@retailscraper.com / admin123
npm run dev
```
The Admin Panel will be available at: `http://localhost:3000/admin/login`

### 3. Chrome Extension Setup
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **"Developer mode"** in the top right corner.
3.  Click **"Load unpacked"**.
4.  Select the `chrome-extension` folder from this repository.

## 📖 How to Use

1.  **Authentication**: Open the extension popup and log in. If you don't have an account, register and wait for admin approval.
2.  **Navigate**: Go to a Realtor.com agent listing page (e.g., `https://www.realtor.com/realestateagents/...`).
3.  **Initiate Scrape**: Click the "INITIATE SCRAPE" button.
4.  **Monitor**: A cyberpunk overlay will appear on the page, showing the current progress and count.
5.  **Export**: Once finished (or the 50-page limit is reached), a CSV file will be downloaded automatically.

---
*Developed for efficient and secure data extraction.*
