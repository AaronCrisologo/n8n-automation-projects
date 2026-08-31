# ️ Setup & Configuration Guide

A step-by-step walkthrough to get this workflow running in your n8n instance.

---

## 1. Prerequisites

| Requirement          | Minimum Version | Notes                              |
|----------------------|-----------------|------------------------------------|
| n8n                  | 1.0+            | Self-hosted or Cloud               |
| Google Workspace     | —               | Personal Gmail works too           |
| Gmail Labels         | 1+              | Create them in Gmail before import |
| Google Sheet         | 1               | A blank target sheet               |
| Google Drive         | 5 GB free       | For attachment storage             |

---

## 2. Google Cloud Project Setup

### 2.1 Create a Project
1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown → **New Project**
3. Name: `n8n-gmail-automation` → Create

### 2.2 Enable APIs
Enable these three APIs for your project:

```
 Gmail API
 Google Drive API
 Google Sheets API
```

Navigate to **APIs & Services → Library**, search each, click **Enable**.

### 2.3 Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. User type: **External** (or Internal if Workspace)
3. Fill in app name, support email, developer email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
5. Save and continue

### 2.4 Create OAuth 2.0 Credentials
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Authorized redirect URIs — add the n8n callback URL:
   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```
   (Replace with your n8n URL if self-hosted)
4. Copy the **Client ID** and **Client Secret**

---

## 3. n8n Credentials

Create three credentials in n8n (**Settings → Credentials**):

### 3.1 Gmail OAuth2
| Field         | Value                                            |
|---------------|--------------------------------------------------|
| Credential    | Gmail OAuth2 API                                 |
| Client ID     | *(from step 2.4)*                               |
| Client Secret | *(from step 2.4)*                               |
| Scope         | `https://www.googleapis.com/auth/gmail.modify`   |

### 3.2 Google Drive OAuth2
| Field         | Value                                            |
|---------------|--------------------------------------------------|
| Credential    | Google Drive OAuth2 API                          |
| Client ID     | *(from step 2.4)*                               |
| Client Secret | *(from step 2.4)*                               |
| Scope         | `https://www.googleapis.com/auth/drive.file`     |

### 3.3 Google Sheets OAuth2
| Field         | Value                                            |
|---------------|--------------------------------------------------|
| Credential    | Google Sheets OAuth2 API                         |
| Client ID     | *(from step 2.4)*                               |
| Client Secret | *(from step 2.4)*                               |
| Scope         | `https://www.googleapis.com/auth/spreadsheets`   |

>  **Tip:** You can reuse the same OAuth client for all three. Just ensure each credential in n8n requests only its own scope.

---

## 4. Prepare the Target Sheet

1. Create a new Google Sheet: `Email Intake Log`
2. In row 1, add headers in this order:

```
Message ID  |  Thread ID  |  Sender Name  |  Sender Email  |  Subject
Date Received  |  Snippet  |  Labels  |  Has Attachments  |  Source Label
```

3. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS_PART_IS_THE_ID]/edit
   ```

---

## 5. Prepare Google Drive

1. Create a parent folder: `Gmail Attachments Archive`
2. Copy its folder ID from the URL (the part after `folders/`)
3. This is your **root folder** — all sender subfolders live inside

---

## 6. Import the Workflow

1. Open n8n → **Workflows → Import from File**
2. Select `gmail-attachments-workflow.json`
3. Open the workflow — nodes flagged in red need credentials/IDs

### Placeholders to Replace

| Placeholder                            | Where to Find It                          |
|----------------------------------------|-------------------------------------------|
| `YOUR_GOOGLE_SHEET_ID_HERE`            | Sheet URL (see step 4)                    |
| `YOUR_GOOGLE_DRIVE_ROOT_FOLDER_ID_HERE`| Drive folder URL (see step 5)            |
| `gmail-oauth-credential-id`            | Replace with your actual n8n credential ID|
| `google-sheets-credential-id`          | Replace with your actual n8n credential ID|
| `google-drive-credential-id`           | Replace with your actual n8n credential ID|

### HTTP Node Authentication

The `HTTP: Find/Create Folder` and `HTTP: Download Attachment` nodes use n8n expressions to pull live OAuth tokens from the credentials at runtime, e.g.:

```
Value: =Bearer {{ $credentials.googleDriveOAuth2Api.accessToken }}
```

The token auto-refreshes on every execution, so the workflow never silently breaks from an expired token. **You don't need to manually replace anything for auth — just create the credentials in step 3.**

All HTTP nodes also have automatic retry enabled (3 attempts, 2-second backoff) to handle transient 5xx / 429 responses from Google APIs.

---

## 7. Customize the Labels

Open the **Define Gmail Labels to Monitor** node and edit the values to match labels that exist in your Gmail.

In Gmail, create labels with these names first:
- `label1`
- `label2`
- `label3`
- `label4`
- `label5`

Or rename them to match your real labels (e.g. `Clients`, `Invoices`, `Recruiting`).

---

## 8. Adjust the Schedule

Open the **Schedule Trigger (Every 15 min)** node.

| If you want…              | Set interval to…            |
|---------------------------|-----------------------------|
| Every 5 minutes           | `*/5` in minutes field      |
| Every 30 minutes          | `30` in minutes field       |
| Hourly                    | Use hours field → `1`       |
| Twice daily (9 AM, 5 PM)  | Use cron field              |

> **Performance note:** Polling Gmail more often than every 5 minutes will use up your API quota. The default 15-minute interval is a safe balance.

---

## 9. Test the Workflow

1. Send a test email to your Gmail
2. Apply one of the monitored labels
3. Attach a small file (PDF, image, etc.)
4. In n8n, click **Execute Workflow** (manual run)
5. Verify:
   -  Row appears in your Google Sheet
   -  Folder `Your Name > Today's Date` appears in Drive
   -  Attachment is inside, with original filename
   -  Email is marked as read in Gmail

---

## 10. Go Live

1. **Toggle the workflow Active** (top-right switch)
2. From now on, the trigger fires automatically
3. Monitor executions under the **Executions** tab

---

## ️ Configuration Caveats (Read Before Importing)

The JSON in this folder is **structurally valid and the graph is correct**, but a few configuration details cannot be expressed in the JSON itself and must be addressed when you first import the workflow into n8n.

### 1. HTTP Node Bearer Tokens — Pre-wired

The 4 HTTP nodes (`Find Existing Sender Folder`, `Create Sender Folder`, `Find Existing Date Folder`, `Download Attachment`) all use n8n expressions to pull live OAuth tokens at runtime:

- Drive calls (`Find Existing *`, `Create *`): `=Bearer {{ $credentials.googleDriveOAuth2Api.accessToken }}`
- Gmail attachment download: `=Bearer {{ $credentials.gmailOAuth2.accessToken }}`

You don't need to touch these — they auto-refresh and the workflow will run as-is once you create the credentials in step 3. If you see a 401 in executions, it's a credential issue, not a JSON issue.

All HTTP nodes also have automatic retry enabled (3 attempts, 2-second backoff) to ride out transient 429s / 5xxs.

### 2. Gmail `markAsRead` Parameter Name

The `Gmail: Mark as Read` node uses `messageId: {{ $json.messageId }}`. In n8n's Gmail node v2.1, the parameter is sometimes named `id` instead of `messageId` depending on the exact sub-version.

**If you get a "missing required field" error:**
1. Open the `Gmail: Mark as Read` node
2. In the message ID field, look for the label — if it says "Message ID" you're good; if it says "ID" the field is just named differently but the value is the same
3. If the field is named `id`, change your expression to `{{ $json.messageId }}` anyway — n8n expressions don't care about the UI label, only the parameter name in the JSON. If needed, edit the raw JSON field and change `messageId` to `id` once.

### 3. OAuth Scopes Required

The Drive and Gmail credentials must each have **at least** these scopes:

| Credential | Required Scope |
|------------|----------------|
| Gmail OAuth2 | `https://www.googleapis.com/auth/gmail.modify` (read + mark as read) |
| Google Drive OAuth2 | `https://www.googleapis.com/auth/drive.file` (create/upload files this app creates) |
| Google Sheets OAuth2 | `https://www.googleapis.com/auth/spreadsheets` |

If you reuse the OAuth 2.0 client from a previous project, double-check the scopes — a credential created with only `gmail.readonly` will fail at the `Mark as Read` step.

### 4. The Schedule Trigger Fires the First Run Instantly

When you **activate** the workflow, n8n will fire the schedule trigger once immediately as a sanity check. If your Gmail has no unread messages in the monitored labels at that moment, the workflow runs to completion with no rows added — that's expected and not an error.

If you see a `Google Sheets: Log Email Details` "success" with 0 rows, that's normal.

### 5. The `If: Has Attachments?` False Branch Goes to NoOp

Emails without attachments are logged to the Sheet, marked as read, then routed through the If node's false branch to a `NoOp` terminal — this explicitly documents the end of the path. If you want to log "no attachments" emails differently (e.g. a separate Sheet tab), add a downstream node off the false output of this If node (the existing `NoOp` is a safe no-op you can disconnect).

---

##  Troubleshooting

| Symptom                              | Likely Cause                                    | Fix                                                      |
|--------------------------------------|--------------------------------------------------|----------------------------------------------------------|
| "Insufficient Permission"            | OAuth scope missing                              | Re-authorize the Gmail/Sheets/Drive credential           |
| "Folder not found" in Drive upload   | Wrong `folderId` expression                       | Re-copy the folder ID from the URL                       |
| Workflow runs but no rows in Sheet   | Sheet headers don't match the mapping            | Verify column names exactly (case-sensitive)             |
| Attachments named with random hash   | Filename not extracted from Gmail metadata      | Ensure `Download Attachment` uses `fileName` option      |
| Quota exceeded                       | Polling too frequently                            | Increase the schedule interval                           |
| Same email processed twice           | Mark-as-Read failed (token expired, etc.)        | Add an error workflow branch to retry                    |

---

##  Security Best Practices

-  Use a dedicated Google account for automation when possible
-  Limit OAuth scope to the minimum (`gmail.modify` not `gmail.full`)
-  Store credentials in n8n's encrypted credential store, not in the JSON file
-  Never commit the filled-in JSON to a public repo — the one in this portfolio has placeholders only
-  Use a service account for non-interactive runs (advanced)
