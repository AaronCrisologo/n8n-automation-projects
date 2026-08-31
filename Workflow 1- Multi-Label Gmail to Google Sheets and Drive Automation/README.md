#  Gmail → Google Sheets + Drive Attachment Pipeline

> An automated, production-ready **n8n workflow** that ingests labeled Gmail messages, logs sender metadata to a Google Sheet, and archives attachments in Google Drive — neatly organized by **label, sender, and date**.

![n8n](https://img.shields.io/badge/n8n-Workflow-EA4B71?logo=n8n&logoColor=white)
![Gmail](https://img.shields.io/badge/Gmail-API-EA4335?logo=gmail&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets-API-34A853?logo=google-sheets&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google_Drive-API-4285F4?logo=google-drive&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)
![Status](https://img.shields.io/badge/Status-Production_Ready-success)

---

##  What It Does

| Capability | Detail |
|------------|--------|
|  **Scheduled Polling** | Runs automatically on a configurable interval (default: every 15 min) |
| ️ **Multi-Label Support** | Monitors up to N Gmail labels in one execution path |
|  **Metadata Logging** | Writes a clean row per email to Google Sheets (sender, subject, date, etc.) |
|  **Attachment Capture** | Downloads every attachment, preserving the **original filename** |
|  **Smart Foldering** | Drive hierarchy: `Root / <Label> / <Sender Name> / <YYYY-MM-DD> / file.ext` |
| ️ **Idempotent** | Re-running never duplicates folders or rows |
|  **Read-on-Process** | Marks email as read so it isn't reprocessed |
| ️ **Defensive** | Edge cases handled — sanitized folder names, `newer_than:1d` window, graceful empty-state |

---

##  Quick Start

```bash
# 1. Clone or download this folder
# 2. Open n8n → Workflows → Import → select gmail-attachments-workflow.json
# 3. Replace placeholders (see SETUP.md)
# 4. Toggle Active 
# 5. Done — the workflow runs itself.
```

Full step-by-step instructions: **[SETUP.md](SETUP.md)**
Architecture deep-dive: **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

##  Tech Stack

| Layer            | Technology                                              |
|------------------|---------------------------------------------------------|
| Orchestration    | n8n (1.0+)                                              |
| Email Source     | Gmail API (via OAuth 2.0)                               |
| Metadata Store   | Google Sheets API (via OAuth 2.0)                       |
| File Storage     | Google Drive API (via OAuth 2.0)                        |
| Custom Logic     | JavaScript (n8n Code nodes)                              |
| Trigger          | Schedule Trigger (cron)                                  |

---

##  Repository Contents

```
PDS/
├── README.md                              # You are here
├── SETUP.md                               # Full configuration walkthrough
├── ARCHITECTURE.md                        # Flow diagrams & design notes
├── gmail-attachments-workflow.json        # The importable n8n workflow
└── screenshots/                           # (Add your own — see below)
```

>  **For maximum portfolio impact:** drop screenshots of your running workflow into a `screenshots/` folder. Recruiters love visuals. Suggested shots:
> 1. n8n canvas with all nodes visible
> 2. A successful execution log
> 3. The Google Sheet after a few test runs
> 4. The Google Drive folder tree showing attachments

---

##  Key Design Decisions

### 1. Idempotent folder creation (Find-or-Create)
Before creating a folder, the workflow **searches** Drive for an existing one with the same name under the same parent. This means restarting n8n or rerunning manually will never produce duplicate `John Doe (2)` folders.

### 2. Mark-as-Read at the end of the pipeline
We process the email fully, *then* mark it read. The `newer_than:1d` filter is a safety net — even if marking fails, the next run won't infinitely replay yesterday's mail.

### 3. Sanitized folder names
Sender names are stripped of characters Drive rejects (`<>:"/\|?*`) and capped at 100 chars. A maliciously crafted `From: "../../etc/passwd"` becomes a safe folder.

### 4. Per-item splitting
Three `Split Out` nodes (one per label, per email, per attachment) make every node downstream see exactly one item. This eliminates the classic "Gmail returned 3 messages but my Code node only saw one" bug.

### 5. Code nodes for parsing
Email headers (`From`, `Date`, etc.) have messy edge cases — encoded names, missing fields, malformed addresses. Pure expressions get ugly fast; small JS functions are clearer and easier to test.

### 6. Label as the outermost folder
The same email can carry multiple Gmail labels. Without a label-level folder, the same file would land in `/Acme/2026-08-29/` regardless of which label triggered processing — and a multi-labeled email would get re-processed and re-uploaded once per label, creating duplicates. The 4-level hierarchy (`Root / <Label> / <Sender> / <Date>`) keeps each label's storage isolated and idempotent.

---

##  Sample Output

### Google Sheet (after a few test runs)

| Message ID  | Sender Name  | Sender Email         | Subject                | Date Received          | Labels         | Has Attachments | Source Label |
|-------------|--------------|----------------------|------------------------|------------------------|----------------|-----------------|--------------|
| 18d4f2a1... | John Doe     | john@acme.com        | Q3 Invoice + Contract  | 2026-08-29 14:23       | label1, client | TRUE            | label1       |
| 18d4f2b7... | Jane Smith   | jane@globex.com      | Meeting Notes          | 2026-08-29 09:11       | label2         | TRUE            | label2       |
| 18d4f2c2... | Acme Corp    | no-reply@acme.com    | Order Confirmation     | 2026-08-28 17:45       | label1         | FALSE           | label1       |

### Google Drive structure

```
 Gmail Attachments Archive/
├──  label1/                          ← e.g. "Clients"
│   ├──  John Doe/
│   │   ├──  2026-08-29/
│   │   │   ├──  Q3_Invoice.pdf
│   │   │   └──  Contract_v2.docx
│   │   └──  2026-08-25/
│   │       └──  Proposal.pdf
│   └──  Acme Corp/
│       └──  2026-08-28/
│           └──  Order_Confirmation.pdf
└──  label2/                          ← e.g. "Invoices"
    └──  Jane Smith/
        └──  2026-08-29/
            └──  meeting_notes.pdf
```
