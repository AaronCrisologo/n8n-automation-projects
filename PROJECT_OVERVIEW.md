#  n8n Automation Portfolio

A collection of production-ready n8n workflows demonstrating API integration, AI-powered automation, and production engineering.

---

## ️ Projects

### 1.  Gmail → Google Sheets + Drive Attachment Pipeline
**Polled, multi-label email processing with attachment archiving**

Monitors multiple Gmail labels on a schedule, logs sender metadata to a Google Sheet, and archives attachments to Google Drive organized by sender and date.

- 23 nodes, 21 connections
- Schedule trigger (every 15 min)
- Find-or-create folder pattern
- Read-on-process idempotency

 **[`Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation/`](Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation/)**

---

### 2.  Telegram Receipt Inbox — Gemini Vision OCR Pipeline
**Conversational, real-time receipt processing powered by Gemini 1.5 Flash**

Receives receipt photos via Telegram, extracts structured data with Gemini Vision, logs to Google Sheets, archives originals to Google Drive by submission date, and replies to the user in real time.

- 20 nodes, 17 connections
- Telegram webhook trigger
- Gemini 1.5 Flash with JSON-mode prompting
- Instant Telegram confirmation with parsed data

 **[`Workflow 2- Telegram Receipt Photo Processing/`](Workflow 2- Telegram Receipt Photo Processing/)**

---

##  Cross-Project Skills Demonstrated

| Skill                                | Workflow 1              | Workflow 2              |
|--------------------------------------|-------------------------|-------------------------|
| **n8n orchestration**                |  23 nodes             |  20 nodes             |
| **Google Sheets API**                |                       |                       |
| **Google Drive API (find-or-create)**|  Sender + Date        |  Date                 |
| **JavaScript Code nodes**            |  Header parsing       |  Gemini JSON parsing  |
| **Defensive parsing / sanitization** |  Folder names         |  Number coercion      |
| **External API integration**         |  Gmail + Drive        |  Telegram + Gemini    |
| **Idempotent folder creation**       |                       |                       |
| **User feedback loop**               | ️ Implicit (read state)|  Telegram reply       |
| **Real-time trigger**                | ️ Polling              |  Webhook              |
| **AI / multi-modal**                 |                       |  Gemini Vision        |
| **Documentation discipline**         |                       |                       |

---

##  30-Second Pitch (for interviews)

> "I built two n8n automation projects. The first polls Gmail across multiple labels, extracts sender metadata to a Google Sheet, and archives attachments in Google Drive organized by sender and date — 23 nodes with find-or-create folder logic. The second is a Telegram bot that receives receipt photos, uses Google Gemini 1.5 Flash to OCR them into structured JSON, logs everything to a Google Sheet, archives the original photo to a date-organized Drive folder, and replies to the user in Telegram with the parsed data. Both demonstrate defensive parsing, idempotent folder creation, and production-ready documentation."

---

##  Final Repository Structure

```
PDS/
├── README.md                                                # Top-level index (this file)
│
├── Workflow 1- Multi-Label Gmail to Google Sheets and Drive Automation/
│   ├── README.md
│   ├── SETUP.md
│   ├── ARCHITECTURE.md
│   └── gmail-attachments-workflow.json
│
└── Workflow 2- Telegram Receipt Photo Processing/
    ├── README.md
    ├── SETUP.md
    ├── ARCHITECTURE.md
    └── telegram-receipt-workflow.json
```
