# ️ Setup & Configuration Guide

A step-by-step walkthrough to get the Telegram Receipt workflow running.

---

## 1. Prerequisites

| Requirement              | Minimum            | Notes                              |
|--------------------------|--------------------|------------------------------------|
| n8n                      | 1.0+               | Self-hosted or Cloud               |
| Telegram account         | —                  | To create the bot                  |
| Google account           | —                  | For Sheets and Drive                |
| Gemini API key           | Free tier          | 15 RPM, 1500 RPD on free           |
| Google Cloud project     | —                  | Same one from Workflow 1 works     |

---

## 2. Create the Telegram Bot

### 2.1 Talk to BotFather
1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Choose a display name: `Receipt Inbox Bot`
4. Choose a username (must end in `bot`): `my_company_receipt_bot`
5. **Copy the HTTP API token** BotFather gives you
   - Format: `123456789:ABCDefGhIJKlmnOPQrstUVwxYZ`

### 2.2 Set the Webhook
Telegram bots can either use **long polling** or **webhooks**. n8n's Telegram trigger uses webhooks.

Once you import the workflow into n8n and add the Telegram credential, n8n will auto-register the webhook on the first execution attempt. If you want to do it manually:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-n8n-domain.com/webhook/telegram-receipt-bot-webhook"
```

The webhook ID in the workflow JSON is `telegram-receipt-bot-webhook` — make sure your n8n public URL ends in `/webhook/telegram-receipt-bot-webhook`.

### 2.3 Test the Bot
- Find your bot in Telegram by searching for its username
- Send `/start`
- (You won't get a reply until the workflow is active in n8n)

---

## 3. Get a Google Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Get API Key** → **Create API Key**
4. Select (or create) a Google Cloud project
5. **Copy the key** — you'll paste it into the workflow

>  **Pricing:** Gemini 2.5 Flash has a free tier via Google AI Studio — 10 requests per minute and 250 per day. That covers most personal and small-business receipt volumes. For higher throughput, the paid tier is ~$0.30 per million input tokens (~$0.0025 per typical receipt).

---

## 4. Google Cloud Project Setup

You can reuse the same project from Workflow 1. If you need a new one:

### 4.1 Create / Select Project
- [Google Cloud Console](https://console.cloud.google.com/)
- Project picker → New Project → name it → Create

### 4.2 Enable APIs
Enable **Google Drive API** and **Google Sheets API** (Gmail API not needed for this workflow).

### 4.3 Configure OAuth Consent Screen
Same as Workflow 1 — add these scopes:
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/spreadsheets`

### 4.4 OAuth Credentials
Create a Web Application OAuth 2.0 client, copy Client ID + Secret.

### 4.5 Authorized Redirect URI
```
http://localhost:5678/rest/oauth2-credential/callback
```
(Update if self-hosted.)

---

## 5. n8n Credentials

Create three credentials in n8n:

### 5.1 Telegram API
| Field         | Value                                |
|---------------|--------------------------------------|
| Credential    | Telegram API                         |
| Access Token  | `<the bot token from BotFather>`     |

### 5.2 Google Drive OAuth2
| Field         | Value                                            |
|---------------|--------------------------------------------------|
| Credential    | Google Drive OAuth2 API                          |
| Client ID     | *(from step 4.4)*                                |
| Client Secret | *(from step 4.4)*                                |
| Scope         | `https://www.googleapis.com/auth/drive.file`     |

### 5.3 Google Sheets OAuth2
| Field         | Value                                            |
|---------------|--------------------------------------------------|
| Credential    | Google Sheets OAuth2 API                         |
| Client ID     | *(from step 4.4)*                                |
| Client Secret | *(from step 4.4)*                                |
| Scope         | `https://www.googleapis.com/auth/spreadsheets`   |

---

## 6. Prepare the Target Sheet

1. Create a new Google Sheet: `Receipt Log`
2. In row 1, add these headers (in this exact order):

```
Timestamp | Submission Date | Telegram User | Telegram User ID | Caption
Merchant | Merchant Address | Receipt Date | Receipt Time | Currency
Subtotal | Tax | Tip | Total | Payment Method | Card Last 4
Category | Line Items | Line Items (JSON) | Notes
Photo File ID | Drive File Name | Submission Date Folder
```

3. Copy the Sheet ID from the URL.

---

## 7. Prepare Google Drive

1. Create a parent folder: `Receipt Inbox`
2. Copy its folder ID from the URL
3. This is your **root folder** — all date subfolders live inside

---

## 8. Import the Workflow

1. **Workflows → Import from File** → select `telegram-receipt-workflow.json`
2. Open the workflow — these nodes need configuration:

### Placeholders to Replace

| Placeholder                            | Where to Find It                              |
|----------------------------------------|-----------------------------------------------|
| `YOUR_GEMINI_API_KEY_HERE`             | Google AI Studio (step 3)                     |
| `YOUR_GOOGLE_SHEET_ID_HERE`            | Sheet URL (step 6)                            |
| `YOUR_GOOGLE_DRIVE_ROOT_FOLDER_ID_HERE`| Drive folder URL (step 7)                     |
| `telegram-api-credential-id`           | Your actual n8n Telegram credential ID        |
| `google-sheets-credential-id`          | Your actual n8n Sheets credential ID          |
| `google-drive-credential-id`           | Your actual n8n Drive credential ID           |

### HTTP Node Authentication

The `HTTP: Find/Create Date Folder` nodes use n8n expressions to pull live OAuth tokens at runtime, e.g.:

```
Value: =Bearer {{ $credentials.googleDriveOAuth2Api.accessToken }}
```

The token auto-refreshes on every execution, so the workflow never silently breaks from an expired token. **You don't need to manually replace anything for auth — just create the credentials in step 5.**

All HTTP nodes (including the Gemini call) have automatic retry enabled (3 attempts, 2-second backoff) to ride out transient 429s / 5xxs.

---

## 9. Test the Workflow

1. Toggle the workflow **Active** in n8n
2. Open Telegram → start a chat with your bot
3. Send a **photo** of a receipt (with a caption like "Client lunch")
4. Expected sequence:
   -  Bot replies: " Receipt logged!" with merchant, total, date, category
   -  Row appears in your Google Sheet
   -  Date folder `2026-08-29` appears in Drive with the original photo inside

### Troubleshooting Tests
| Test                                  | Expected Result                                       |
|---------------------------------------|-------------------------------------------------------|
| Send a text message only              | Bot replies "Please send a photo"                    |
| Send a blurry / unreadable photo      | Bot replies with parse error notification            |
| Send a non-receipt photo (cat, etc.)  | Sheet row with `null` fields, photo still saved      |
| Send a PDF document                   | Telegram treats it as a document, not photo — ignored|

---

## 10. Go Live

Once tests pass, leave the workflow active. The Telegram webhook persists across n8n restarts as long as the workflow stays active.

---

## ️ Configuration Caveats (Read Before Importing)

The JSON in this folder is **structurally valid and the graph is correct**, but a few configuration details cannot be expressed in the JSON itself and must be addressed when you first import the workflow into n8n.

### 1. HTTP Node Bearer Tokens — Pre-wired

The `HTTP: Find/Create Date Folder` and `HTTP: Gemini Vision Extract` nodes all use n8n expressions to pull live tokens at runtime:

- Drive calls: `=Bearer {{ $credentials.googleDriveOAuth2Api.accessToken }}`
- Gemini call: uses `x-goog-api-key` header set to the `YOUR_GEMINI_API_KEY_HERE` placeholder — replace this with your actual key from step 3

You don't need to touch the Drive auth expressions — they auto-refresh. **Just make sure to replace `YOUR_GEMINI_API_KEY_HERE` with your actual key from Google AI Studio.**

All HTTP nodes also have automatic retry enabled (3 attempts, 2-second backoff) to handle transient 429s / 5xxs.

### 2. Telegram Webhook Registration Requires a Public URL

The `Telegram Trigger` node uses webhooks, not long-polling. **For Telegram to deliver messages to your n8n instance, n8n must be reachable from the public internet** at the webhook URL.

| Environment | What to do |
|-------------|------------|
| **n8n Cloud** | Works out of the box — n8n provides a public URL |
| **Self-hosted (public server)** | Make sure port 5678 (or your custom port) is open and you have HTTPS |
| **Local development** | Use `ngrok` or `cloudflared` to tunnel: `ngrok http 5678` |

When n8n first executes the workflow, it calls Telegram's `setWebhook` API automatically. To verify, check the **Executions** tab — the first run should show a successful webhook registration.

If the bot doesn't respond to messages, run this manually to debug:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```
Look for `"url": "https://your-n8n-url/webhook/telegram-receipt-bot-webhook"`.

### 3. The Telegram HTTP Download Uses the Bot Token, Not OAuth

The `HTTP: Download Photo Bytes` node's URL is:
```
https://api.telegram.org/file/bot{{ $credentials.telegramApi.accessToken }}/...
```

This **assumes your n8n Telegram credential uses the `accessToken` field name** (the default for the standard `telegramApi` credential type). If you used a custom credential type, the field name may differ — check the credential in **Settings → Credentials → Telegram API** to confirm.

### 4. Gemini API Key Goes in the Header (Not as a Query Param)

The `HTTP: Gemini Vision Extract` node passes the key in the `x-goog-api-key` header. The Gemini API also accepts `?key=...` as a query parameter, but using the header is the recommended approach — query params get logged in URLs and HTTP request logs.

**Replace `YOUR_GEMINI_API_KEY_HERE` with your actual key** before first run.

### 5. Gemini Image Limits

Gemini 2.5 Flash accepts images up to **20 MB** (per file) and **up to 3600 images per request**. Telegram photos are always JPEG and typically 200 KB – 2 MB, so you'll never hit the limit for normal use. But:
- If a user sends a **document** (a PDF, say) instead of a photo, this workflow silently ignores it (the `If: Has Photo?` check fails). This is intentional.
- If a user sends a **very high-res photo** (rare on Telegram), it will be downsized by Telegram before delivery.

### 6. The `If: Gemini Parse OK?` Branch Logic

When Gemini returns a malformed response (e.g., it returns a string of plain English instead of JSON), the parse fails and the workflow sends the user a "please try again" message. The row is **not** logged to Sheets and the photo is **not** uploaded to Drive. This is intentional — better to ask for a retake than to log garbage.

If you want to log *every* attempt (even failures) for auditing, change the False branch to also write a row to a "Failed Receipts" tab with a `parseError: true` flag.

### 7. Rate Limits

| Service | Free tier limit | What happens if you exceed |
|---------|-----------------|----------------------------|
| Gemini 2.5 Flash | 10 requests/min, 250/day | HTTP 429 — the workflow fails for that one photo, but subsequent photos work |
| Telegram Bot API | 30 messages/sec to one chat, 20 messages/min to same group | HTTP 429 — retry next photo |
| Google Drive API | 12,000 requests/min per project | Effectively unlimited for personal use |

The default Telegram flow processes **one photo at a time**, so rate limits won't be a problem unless a user spam-sends 15+ photos in one minute.

---

##  Troubleshooting

| Symptom                                | Likely Cause                            | Fix                                                    |
|----------------------------------------|------------------------------------------|--------------------------------------------------------|
| Bot doesn't respond                    | Webhook not registered                  | Check n8n execution logs for webhook registration      |
| 403 on Gemini call                     | API key invalid or restricted           | Re-create key in AI Studio                             |
| Gemini returns empty `candidates`      | Image too large or wrong MIME            | Telegram photos are always JPEG — verify download      |
| "Permission denied" on Drive upload    | Wrong folder ID or scope                | Re-authorize the Drive credential                      |
| Sheet row has `undefined` for values   | Gemini returned non-JSON                | Parser surfaces `parseError: true` — improve prompt   |
| Same photo uploaded twice              | Bot was started twice                    | Check for multiple workflow instances / duplicate bots|
| `files:[]` empty on folder find        | Folder name mismatch (date format)      | Verify `submissionDateFolder` is YYYY-MM-DD           |

---

##  Security Best Practices

-  **Don't commit your real API key** — keep `YOUR_GEMINI_API_KEY_HERE` as a placeholder
-  **Restrict the bot** — if you want it private, only respond to your Telegram user ID by adding a check in the `If: Has Photo?` node:
  ```js
  // Add an AND condition:
  // $json.message.from.id === YOUR_TELEGRAM_USER_ID
  ```
-  **Limit OAuth scope** — `drive.file` only grants access to files this app creates, not your entire Drive
-  **Rate limit Gemini** — free tier is 10 RPM. If you process more than 10 receipts/minute, upgrade to a paid tier (or switch to Tesseract, see § 11)
-  **Rotate your bot token** — if leaked, use @BotFather's `/revoke` command

---

##  Optional Enhancements

- **Multi-user support** — drop the `If: Has Photo?` user check, let your team submit receipts
- **Currency conversion** — call an exchange rate API, store both original and USD amounts
- **Auto-categorization rules** — add a Code node that overrides Gemini's category based on amount thresholds
- **Duplicate detection** — hash the photo bytes, check the Sheet for existing hash before uploading
- **Approval flow** — for amounts over $X, send to a manager's Telegram with inline Approve/Reject buttons
- **Weekly summary** — separate workflow that runs Friday at 5pm and emails a spend report

---

## 11. Switching to Tesseract OCR (Local Alternative)

If you want to avoid sending receipt photos to Google's servers — for privacy, offline use, or because you've hit Gemini's free tier limit — you can swap the Gemini vision node for [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), an open-source local OCR engine.

### Tradeoffs to know first

| | Gemini 2.5 Flash | Tesseract |
|---|---|---|
| **Cost** | Free tier (250/day), then paid | Free, runs locally |
| **Privacy** | Sends photo to Google API | Fully local — nothing leaves your machine |
| **Setup** | Just an API key | Install Tesseract binary + a language pack |
| **Output** | Structured JSON (single call) | Raw text only — you write the parser |
| **Accuracy on messy receipts** | High | Lower — expect more manual corrections |
| **Speed** | ~1.5s per receipt (network-bound) | 1–3s per receipt (CPU-bound) |

### Installation

1. **Install Tesseract on the host running n8n:**
   - macOS: `brew install tesseract`
   - Ubuntu/Debian: `sudo apt install tesseract-ocr`
   - Windows: download installer from [UB Mannheim's repo](https://github.com/UB-Mannheim/tesseract/wiki)
2. **Add a language pack if you need non-English receipts:**
   - macOS: `brew install tesseract-lang`
   - Ubuntu: `sudo apt install tesseract-ocr-[lang]` (e.g. `tesseract-ocr-deu` for German)

### Modifying the workflow

The change is to the `HTTP: Gemini Vision Extract` node. Replace it with an **Execute Command** node that shells out to Tesseract:

```bash
tesseract {{ $binary.data.filePath }} stdout -l eng
```

(Replace `{{ $binary.data.filePath }}` with the path to your downloaded Telegram photo, or pipe the base64-decoded image to Tesseract's stdin.)

### Writing the parser

Unlike Gemini, Tesseract returns **raw text**. You'll need to add a Code node after the Execute Command node that:
1. Looks for date patterns (regex: `\d{1,2}[/-]\d{1,2}[/-]\d{2,4}`)
2. Finds the total (look for lines containing "total", "amount", "sum" and take the largest currency-formatted number on that line)
3. Extracts merchant name (usually the first non-empty line in larger font)
4. Falls back to `null` for anything ambiguous

This is the main reason most users stick with Gemini — the structured output saves you from writing brittle parsers. Tesseract is worth it when privacy or quota limits matter more than parsing reliability.
