# Chaptera — Self Publishing Suite (Python)

Full working AI tool for book publishing companies and authors.

## Original UI + Python AI

- **3-column layout** (settings · book preview · AI analysis) — same style you liked
- **Python backend** for grammar, spelling, duplicates, readability, character names
- **Upload** TXT, DOCX, PDF
- **Author details** — title, author, chapter
- **Book formatting** — templates, fonts, margins, columns
- **Global sizes (mm)** — 148×210 through 210×297 + inch sizes
- **Resolution** — 300 / 600 / 1200 DPI
- **Download** — PDF, PNG, HTML

## Run

**Development (auto-reload when files change):**

PowerShell (VS Code terminal):
```powershell
cd chaptera-ai
.\dev.ps1
```

Or double-click `dev.bat` in File Explorer.

**Normal run:**
```powershell
cd chaptera-ai
.\run.bat
```

Or:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open: **http://127.0.0.1:5000**

**Production / live run:**

Windows VPS:
```powershell
cd chaptera-ai
.\start-production.bat
```

Cloud platforms can use:
```bash
pip install -r requirements.txt
CHAPTERA_DEV=0 waitress-serve --listen=0.0.0.0:$PORT wsgi:app
```

Useful environment variables:
- `CHAPTERA_DEV=0` disables Flask debug/reload for live use.
- `CHAPTERA_MAX_MB=100` controls upload size in MB.
- `CHAPTERA_CORS_ORIGINS=https://your-domain.com` enables cross-origin API access only for listed domains.
- `CHAPTERA_JOB_TTL_SECONDS=21600` controls how long completed background jobs stay in memory.

## Workflow

1. Upload **Word / TXT / PDF** or paste in manuscript box
2. Set **author name**, **book title**, **chapter**
3. Choose **English** (US / UK / AU / NZ)
4. Click **Analyze with Python AI**
5. See **accuracy %**, **readability**, **issues** on the right
6. Click **Apply AI Auto-Fixes**
7. Pick **page size** and **600 DPI**
8. **Download PDF**

## Tech

- Flask · LanguageTool API · pyspellchecker · textstat · python-docx · pypdf
