# Automation Setup Guide

This repository now has automated commit tracking and daily analysis capabilities.

## 🔄 Auto-Commit System

**File:** `auto-commit.js`

### Features

- Watches repo for file changes using chokidar
- Auto-commits every 15 minutes if changes detected
- Daily push to origin at midnight
- Ignores node_modules, .git, dist, build, .env

### Installation

```bash
npm install chokidar node-cron
```

### Usage

**Foreground (testing):**

```bash
node auto-commit.js
```

**Background with nohup:**

```bash
nohup node auto-commit.js > auto-commit.log 2>&1 &
```

**Background with PM2 (recommended):**

```bash
npm install -g pm2
pm2 start auto-commit.js --name "milla-auto-commit"
pm2 save
pm2 startup
```

**Stop PM2:**

```bash
pm2 stop milla-auto-commit
pm2 delete milla-auto-commit
```

---

## 📊 Daily Empire Analysis

**Workflow:** `.github/workflows/daily-empire.yml`  
**Script:** `daily-analysis.cjs`

### Features

- Runs daily at 8:00 AM CST (13:00 UTC)
- Analyzes repository structure (files, lines, types)
- Scans 5 rival GitHub repositories for metrics
- Scrapes AI-related news headlines
- Generates TypeScript code samples
- Creates comprehensive markdown report
- Zips generated files
- Emails report + attachments to you

### Required GitHub Secrets

Go to: **Settings → Secrets and variables → Actions**

Add these secrets:

- `EMAIL_FROM` - Your Gmail address
- `EMAIL_PASS` - Gmail app password ([create here](https://myaccount.google.com/apppasswords))
- `EMAIL_TO` - Recipient email address

### Manual Trigger

Go to: **Actions → Daily Empire Report → Run workflow**

Or via CLI (if authenticated):

```bash
gh workflow run daily-empire.yml
```

### Output

The workflow creates:

- `report.md` - Comprehensive analysis report
- `updates.zip` - Generated code files
- GitHub Actions artifacts (30-day retention)
- Email with attachments to specified recipient

### Generated Files

The script creates in `generated/` folder:

- `dispatcher.ts` - Task dispatching system
- `intelligence-gatherer.ts` - Data collection framework
- `analysis-config.json` - Configuration
- `README.md` - Documentation

---

## 🔒 Security

✅ Pinned action versions for security  
✅ Secrets stored in GitHub (never in code)  
✅ Read-only permissions  
✅ 15-minute timeout  
✅ .env excluded from commits  
✅ Automatic cleanup of temporary files

---

## 📅 Schedule

| Task                  | Frequency    | Time (CST) |
| --------------------- | ------------ | ---------- |
| Auto-commit check     | Every 15 min | —          |
| Auto-push to origin   | Daily        | 12:00 AM   |
| Daily Empire Analysis | Daily        | 8:00 AM    |

---

## 🧪 Testing

**Test auto-commit:**

```bash
# Edit a file and wait 15 minutes, or trigger manually
node auto-commit.js
# Make a change to test detection
```

**Test daily analysis locally:**

```bash
# Note: Requires dependencies
npm install --no-save axios cheerio adm-zip nodemailer
node daily-analysis.cjs
```

**Simple structure test:**

```bash
bash test-analysis-simple.sh
```

---

## 📝 Next Steps

1. ✅ Secrets configured in GitHub
2. ⏳ Commit and push these files
3. ⏳ Wait for first daily run (8 AM CST) or trigger manually
4. ⏳ Check your email for the report
5. ⏳ (Optional) Start auto-commit watcher locally

---

_Created: 2026-01-14_
