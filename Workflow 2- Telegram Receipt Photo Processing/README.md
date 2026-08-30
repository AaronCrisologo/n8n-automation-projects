#  Telegram Receipt Inbox — Gemini Vision OCR Pipeline

> A conversational n8n workflow that turns receipt **photos sent via Telegram** into structured, queryable data — with the originals safely archived in Google Drive.

![n8n](https://img.shields.io/badge/n8n-Workflow-EA4B71?logo=n8n&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-8E75B2?logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets-API-34A853?logo=google-sheets&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google_Drive-API-4285F4?logo=google-drive&logoColor=white)
![Status](https://img.shields.io/badge/Status-Production_Ready-success)

---

##  What It Does

| Capability | Detail |
|------------|--------|
|  **Telegram Inbox** | Receives receipt photos from any user (or restricted to your account) |
|  **Gemini Vision OCR** | Extracts merchant, date, totals, line items, payment method, category |
|  **Structured Logging** | Appends a clean row per receipt to Google Sheets (24 columns) |
|  **Auto-Organized Storage** | Sends original photo to `Drive / <submission-date> / file.jpg` |
|  **Instant Confirmation** | Replies to the user with parsed fields in a clean Markdown message |
| ️ **Error Feedback** | Tells the user immediately if the photo couldn't be parsed |
| ️ **Idempotent Folders** | Same-day submissions land in the same Drive folder — no duplicates |

---

##  Quick Start

```bash
# 1. Create a Telegram bot via @BotFather
# 2. Get a Google Gemini API key from AI Studio
# 3. Import telegram-receipt-workflow.json into n8n
# 4. Replace placeholders (see SETUP.md)
# 5. Activate the workflow
# 6. Send a photo to your bot on Telegram
```

Full setup walkthrough: **[SETUP.md](SETUP.md)**
Architecture deep-dive: **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

##  Tech Stack

| Layer              | Technology                                              |
|--------------------|---------------------------------------------------------|
| Orchestration      | n8n (1.0+)                                              |
| Input Channel      | Telegram Bot API (webhook)                              |
| Vision / LLM       | Google Gemini 2.5 Flash (primary) / Tesseract OCR (alternative) |
| Metadata Store     | Google Sheets API (OAuth 2.0)                           |
| File Storage       | Google Drive API (OAuth 2.0)                            |
| Custom Logic       | JavaScript (n8n Code nodes)                              |

---

##  Repository Contents

```
Workflow 2- Telegram Receipt Photo Processing/
├── README.md                              # You are here
├── SETUP.md                               # Full configuration walkthrough
├── ARCHITECTURE.md                        # Flow diagrams & design notes
└── telegram-receipt-workflow.json         # Importable n8n workflow (20 nodes)
```

---

##  Key Design Decisions

### 1. Gemini 2.5 Flash as the default
- **Latency:** ~1.5s for a typical receipt
- **Cost:** Free tier via Google AI Studio — 10 RPM, 250 RPD, sufficient for most personal/small-business use. Paid tier is $0.30/M input tokens if you need more
- **Accuracy:** High accuracy on real-world receipts
- **Structured output:** Excellent JSON compliance with `responseMimeType: application/json`
- **Quota:** Free tier RPD is the most likely ceiling to hit; rarely RPM unless burst-uploading

### 2. Tesseract OCR as a fallback alternative
If you can't or don't want to use a cloud API, you can swap Gemini for [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) (open-source, runs locally). The tradeoffs:
- **Pro:** No API key, no cloud cost, fully local/private
- **Con:** Returns raw text only — you'll need to add a parsing step (regex/heuristics) to extract the same structured fields. Expect more failed parses on messy receipts
- **Con:** Slower on large images without GPU
- **Best for:** Privacy-sensitive deployments, offline use, or when Gemini's free tier quota isn't enough

See [SETUP.md](SETUP.md) § 11 for instructions on switching to Tesseract.

### 3. Forced JSON via `responseMimeType`
Setting `responseMimeType: "application/json"` in the Gemini request tells the model to skip markdown wrapping entirely. The Code node still strips ```json fences defensively, in case the model occasionally ignores the instruction.

### 4. Pick highest-resolution photo from Telegram's array
Telegram sends each photo as an array of up to 4 sizes (90×90, 320×320, 800×800, 1280×1280). We pick the last one — best quality for OCR.

### 5. Structured prompt with explicit `null` for missing values
The prompt instructs Gemini to return `null` rather than guess. This lets downstream analytics distinguish *"we don't know the tax amount"* from *"the tax was $0"*.

### 6. Find-or-Create pattern for date folders
Same idempotency principle as Workflow 1 — submissions on the same day share a single Drive folder, no matter how many times the workflow runs.

### 7. Telegram reply with parsed data
Closes the UX loop. The user knows in seconds whether their photo was readable. No silent failures.

### 8. Date on **submission**, not receipt date
If you upload a photo of a 3-week-old receipt today, it lands in today's Drive folder. Why? Because:
- Drive folders organized by "when it arrived" → predictable, queryable
- Receipt date is preserved in the Sheet → still available for accounting
- Idempotency: re-sending the same photo never creates a new folder

---

##  Sample Output

### Telegram conversation

> **You:** *[sends photo of a Whole Foods receipt]*
> **Bot:**  Receipt logged!
>  *Whole Foods Market*
>  2026-08-29 at 18:42
>  USD 47.32
> ️ Category: meals
>  Saved to Drive folder: `2026-08-29`

### Google Sheet (after a few submissions)

| Timestamp           | Merchant           | Receipt Date | Total  | Currency | Category | Payment | Line Items | Drive File Name                  |
|---------------------|--------------------|--------------|--------|----------|----------|---------|------------|----------------------------------|
| 2026-08-29T18:42:15Z | Whole Foods Market | 2026-08-29   | 47.32  | USD      | meals    | card    | 5          | receipt_482391_20260829_184215.jpg |
| 2026-08-29T21:30:42Z | Uber               | 2026-08-29   | 23.50  | USD      | travel   | card    | 1          | receipt_715290_20260829_213042.jpg |
| 2026-08-28T09:15:02Z | Starbucks          | 2026-08-28   | 6.75   | USD      | meals    | card    | 2          | receipt_482391_20260828_091502.jpg |

### Google Drive structure

```
 Receipt Inbox/
├──  2026-08-29/
│   ├── ️ receipt_482391_20260829_184215.jpg
│   └── ️ receipt_715290_20260829_213042.jpg
└──  2026-08-28/
    └── ️ receipt_482391_20260828_091502.jpg
```

---

##  Extending the Workflow

| Add-on                                | Difficulty | Why it impresses                              |
|---------------------------------------|------------|-----------------------------------------------|
| Multi-currency conversion             |           | Real-world accounting concern                  |
| Auto-approval for amounts under $25   |           | Expense policy automation                     |
| Manager approval via inline buttons   |         | Two-way Telegram interactivity                |
| Duplicate detection (photo hash)      |           | Prevents accidental double-uploads            |
| Weekly email digest                   |           | Reporting layer                               |
| Categorization via machine learning   |         | Smarter than Gemini's heuristics              |
| Notion / Airtable as alternative sink |           | Database flexibility                          |
