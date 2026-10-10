"""
Chaptera AI  Flask server for self-publishing manuscript proofreading.
Run: python app.py          (normal)
Dev:  dev.bat or CHAPTERA_DEV=1 python app.py  (auto-reload + browser refresh)
Open: http://127.0.0.1:5000
"""

import io
import base64
import hashlib
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from core.analyzer import ChapteraAnalyzer
from core.dictionary_loader import dictionary_stats
from core.export import build_docx_bytes, build_pdf_bytes, build_txt_content
from core.file_parser import extract_metadata, extract_text

BASE = Path(__file__).resolve().parent
UPLOAD_DIR = BASE / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DATA_DIR = BASE / "data"
DATA_DIR.mkdir(exist_ok=True)
PROJECTS_FILE = DATA_DIR / "projects.json"
USERS_FILE = DATA_DIR / "users.json"

ALLOWED = {".txt", ".docx", ".doc", ".pdf"}
MAX_MB = int(os.environ.get("CHAPTERA_MAX_MB", "100"))
WORDS_PER_PAGE_ESTIMATE = 320
MAX_PAGES = int(os.environ.get("CHAPTERA_MAX_PAGES", "500"))
DEV_MODE = os.environ.get("CHAPTERA_DEV", "1") == "1"
JOB_TTL_SECONDS = int(os.environ.get("CHAPTERA_JOB_TTL_SECONDS", str(6 * 60 * 60)))
JOB_MAX_RESULTS = int(os.environ.get("CHAPTERA_JOB_MAX_RESULTS", "200"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CHAPTERA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
if CORS_ORIGINS:
    CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})

engine = ChapteraAnalyzer()
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_projects_lock = threading.Lock()
_users_lock = threading.Lock()
_reload_token = 0
_watch_snapshot = ""


def limit_message() -> str:
    return f"Maximum supported file is {MAX_PAGES} pages and {MAX_MB} MB."


@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(_error):
    return jsonify({"error": limit_message()}), 413


@app.after_request
def add_no_cache_headers(response):
    if response.content_type and response.content_type.startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def collect_watch_files():
    """Paths watched by Flask reloader (templates, static, core, app)."""
    paths = [str(BASE / "app.py")]
    for folder in ("templates", "static", "core"):
        root = BASE / folder
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file():
                paths.append(str(path))
    return paths


def compute_watch_snapshot():
    parts = []
    for path in collect_watch_files():
        p = Path(path)
        if p.is_file():
            parts.append(f"{p}:{p.stat().st_mtime_ns}")
    return "|".join(parts)


def estimate_text_pages(text: str) -> int:
    if not text or not text.strip():
        return 0
    explicit_pages = text.count("\f") + 1 if "\f" in text else 0
    if explicit_pages:
        return explicit_pages
    words = len(re.findall(r"\b\w+\b", text))
    return max(1, (words + WORDS_PER_PAGE_ESTIMATE - 1) // WORDS_PER_PAGE_ESTIMATE)


def ensure_page_limit(text: str, page_count: int | None = None) -> int:
    pages = int(page_count or estimate_text_pages(text))
    if pages > MAX_PAGES:
        raise ValueError(f"{limit_message()} This file has about {pages} pages.")
    return pages


def normalize_author_email(value: str) -> str:
    email = (value or "guest@chaptera.local").strip().lower()
    return email or "guest@chaptera.local"


def load_projects() -> list[dict]:
    if not PROJECTS_FILE.exists():
        return []
    try:
        raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_projects(projects: list[dict]) -> None:
    tmp = PROJECTS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(projects, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PROJECTS_FILE)


def load_users() -> list[dict]:
    if not USERS_FILE.exists():
        return []
    try:
        raw = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_users(users: list[dict]) -> None:
    tmp = USERS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(USERS_FILE)


def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + (password or "")).encode("utf-8")).hexdigest()


def public_author(user: dict) -> dict:
    return {
        "name": user.get("name") or "Author",
        "email": normalize_author_email(user.get("email", "")),
        "token": user.get("token") or "",
    }


def author_from_request(data: dict) -> tuple[str, str]:
    token = str(data.get("author_token") or data.get("authorToken") or "").strip()
    if token:
        with _users_lock:
            user = next((item for item in load_users() if item.get("token") == token), None)
        if user:
            return normalize_author_email(user.get("email", "")), str(user.get("name") or "Author")
    return (
        normalize_author_email(data.get("author_email") or data.get("authorEmail") or ""),
        str(data.get("author_name") or data.get("authorName") or "Guest Author"),
    )


def sanitize_project_payload(payload: dict) -> dict:
    project_id = str(payload.get("projectId") or payload.get("id") or uuid.uuid4().hex)
    author_email = normalize_author_email(payload.get("authorEmail", ""))
    title = str(payload.get("title") or payload.get("filename") or "Untitled manuscript").strip() or "Untitled manuscript"
    text = str(payload.get("text") or "")
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    downloads = payload.get("downloads") if isinstance(payload.get("downloads"), list) else []
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": project_id,
        "projectId": project_id,
        "title": title[:240],
        "authorName": str(payload.get("authorName") or "Guest Author").strip()[:160] or "Guest Author",
        "authorEmail": author_email,
        "filename": secure_filename(str(payload.get("filename") or ""))[:240],
        "wordCount": int(payload.get("wordCount") or len(re.findall(r"\b\w+\b", text))),
        "text": text,
        "settings": settings,
        "analyzed": bool(payload.get("analyzed")),
        "fixed": bool(payload.get("fixed")),
        "processing": bool(payload.get("processing")),
        "downloadProcessing": bool(payload.get("downloadProcessing")),
        "downloaded": bool(payload.get("downloaded")),
        "issueCount": int(payload.get("issueCount") or payload.get("issue_count") or 0),
        "spellingCount": int(payload.get("spellingCount") or payload.get("spelling_count") or 0),
        "accuracyPercent": int(payload.get("accuracyPercent") or payload.get("accuracy_percent") or 0),
        "readabilityScore": str(payload.get("readabilityScore") or payload.get("readability_score") or ""),
        "aiJob": payload.get("aiJob") if isinstance(payload.get("aiJob"), dict) else None,
        "downloadJob": payload.get("downloadJob") if isinstance(payload.get("downloadJob"), dict) else None,
        "downloads": downloads[:20],
        "createdAt": str(payload.get("createdAt") or now),
        "updatedAt": str(payload.get("updatedAt") or now),
        "completedAt": str(payload.get("completedAt") or "") if payload.get("completedAt") else "",
    }


@app.context_processor
def inject_template_globals():
    asset_files = [
        BASE / "static" / "studio.js",
        BASE / "static" / "studio.css",
        BASE / "static" / "fonts-catalog.js",
    ]
    asset_version = max(
        [int(p.stat().st_mtime) for p in asset_files if p.exists()] or [int(time.time())]
    )
    return {
        "dev_mode": DEV_MODE,
        "asset_v": int(time.time()) if DEV_MODE else str(asset_version),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/my-projects")
def my_projects():
    return render_template("my_projects.html")


@app.route("/recent-activity")
def recent_activity():
    return render_template("recent_activity.html")


@app.route("/settings")
def settings():
    app.jinja_env.cache.clear()
    return render_template("settings.html")


@app.route("/help-support")
def help_support():
    return render_template("help_support.html")


@app.route("/api/health")
def health():
    """Readiness probe  dev scripts wait for this before opening the browser."""
    return jsonify({"ok": True, "status": "ok", "app": "Chaptera AI", "dev": DEV_MODE})


@app.route("/api/dev/reload-check")
def reload_check():
    """Browser polls this in dev mode; token changes when any project file is saved."""
    global _reload_token, _watch_snapshot
    snap = compute_watch_snapshot()
    if snap != _watch_snapshot:
        if _watch_snapshot:
            _reload_token += 1
        _watch_snapshot = snap
    return jsonify({"token": _reload_token, "dev": DEV_MODE})


@app.route("/api/dictionary-stats")
def dict_stats():
    """Report loaded dictionary size (American + British word lists)."""
    return jsonify(dictionary_stats())


def _run_analyze_payload(data: dict) -> dict:
    text = data.get("text", "")
    locale = data.get("locale", "en-US")
    preserve = bool(data.get("preserve_text", True))
    stats_only = bool(data.get("stats_only", False))
    fast = bool(data.get("fast", False))
    if stats_only:
        return engine.analyze_stats(text, locale)
    if len(text) > 8000:
        return engine.analyze_bulk(text, locale, preserve_original=preserve, fast=fast)
    return engine.analyze(text, locale, preserve_original=preserve, fast=fast)


def _run_fix_payload(data: dict) -> dict:
    return engine.apply_fixes(
        data.get("text", ""),
        data.get("locale", "en-US"),
        fast=bool(data.get("fast", True)),
        preserve=data.get("preserve"),
    )


def _run_export_payload(data: dict) -> dict:
    fmt = data.get("format", "txt")
    payload = data.get("payload") or data
    text = payload.get("text", "")
    if not text.strip():
        raise ValueError("No manuscript text to export")
    ensure_page_limit(text)
    title = payload.get("title", "")
    if fmt == "txt":
        raw = build_txt_content(
            title,
            payload.get("author", ""),
            payload.get("chapter", ""),
            text,
        ).encode("utf-8")
        filename = secure_filename((title or "manuscript").replace(" ", "_")) + ".txt"
        mime = "text/plain"
    elif fmt == "word":
        raw = build_docx_bytes(
            title,
            payload.get("author", ""),
            payload.get("chapter", ""),
            text,
            font_size=int(payload.get("font_size", 11)),
            font_name=payload.get("body_font", "Times New Roman"),
            line_height=float(payload.get("line_height", 1.25)),
            text_align=payload.get("text_align", "justify"),
            margin=float(payload.get("margin", 20)),
            page_width=float(payload.get("page_width", 148)),
            page_height=float(payload.get("page_height", 210)),
            page_unit=payload.get("page_unit", "mm"),
        )
        filename = secure_filename((title or "manuscript").replace(" ", "_")) + ".docx"
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif fmt == "pdf":
        raw = build_pdf_bytes(
            title,
            payload.get("author", ""),
            payload.get("chapter", ""),
            text,
            font_size=int(payload.get("font_size", 11)),
            font_name=payload.get("body_font", "Times New Roman"),
            line_height=float(payload.get("line_height", 1.25)),
            margin=float(payload.get("margin", 20)),
            page_width=float(payload.get("page_width", 148)),
            page_height=float(payload.get("page_height", 210)),
            page_unit=payload.get("page_unit", "mm"),
        )
        size_key = secure_filename(str(payload.get("size_key") or "").replace(" ", "_"))
        suffix = f"_{size_key}" if size_key else ""
        filename = secure_filename((title or "book").replace(" ", "_")) + suffix + ".pdf"
        mime = "application/pdf"
    else:
        raise ValueError("Unsupported background export format")
    if len(raw) > MAX_MB * 1024 * 1024:
        raise ValueError(limit_message())
    return {
        "format": fmt,
        "filename": filename,
        "mime": mime,
        "data": base64.b64encode(raw).decode("ascii"),
    }


def _set_job(job_id: str, **updates) -> None:
    with _jobs_lock:
        _cleanup_jobs_locked()
        job = _jobs.setdefault(job_id, {})
        job.update(updates)
        job["updated_at"] = time.time()


def _cleanup_jobs_locked() -> None:
    now = time.time()
    expired = [
        job_id
        for job_id, job in _jobs.items()
        if job.get("status") in {"done", "error"}
        and now - float(job.get("updated_at") or job.get("created_at") or now) > JOB_TTL_SECONDS
    ]
    for job_id in expired:
        _jobs.pop(job_id, None)

    if len(_jobs) <= JOB_MAX_RESULTS:
        return
    removable = sorted(
        (
            (float(job.get("updated_at") or job.get("created_at") or 0), job_id)
            for job_id, job in _jobs.items()
            if job.get("status") in {"done", "error"}
        )
    )
    overflow = len(_jobs) - JOB_MAX_RESULTS
    for _, job_id in removable[:overflow]:
        _jobs.pop(job_id, None)


def _start_job(kind: str, data: dict) -> str:
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _cleanup_jobs_locked()
        _jobs[job_id] = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
        }

    def worker() -> None:
        _set_job(job_id, status="running")
        try:
            if kind == "analyze":
                result = _run_analyze_payload(data)
            elif kind == "fix":
                result = _run_fix_payload(data)
            elif kind == "export":
                result = _run_export_payload(data)
            else:
                raise ValueError("Unknown job type")
            _set_job(job_id, status="done", result=result)
        except Exception as exc:
            _set_job(job_id, status="error", error=str(exc))

    threading.Thread(target=worker, daemon=True).start()
    return job_id


@app.route("/api/job/start", methods=["POST"])
def start_job():
    data = request.get_json(force=True, silent=True) or {}
    kind = data.get("kind", "analyze")
    text = data.get("text", "")
    if kind not in {"analyze", "fix", "export"}:
        return jsonify({"error": "Unknown job type"}), 400
    if kind != "export" and not text.strip():
        return jsonify({"error": "No text provided"}), 400
    job_id = _start_job(kind, data)
    return jsonify({"job_id": job_id, "status": "queued"})


@app.route("/api/job/status", methods=["POST"])
def job_status():
    data = request.get_json(force=True, silent=True) or {}
    job_id = data.get("job_id", "")
    with _jobs_lock:
        _cleanup_jobs_locked()
        job = dict(_jobs.get(job_id) or {})
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get("name") or "Author").strip()[:160] or "Author"
    email = normalize_author_email(data.get("email") or "")
    password = str(data.get("password") or "")
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400
    with _users_lock:
        users = load_users()
        if any(normalize_author_email(item.get("email", "")) == email for item in users):
            return jsonify({"error": "Account already exists. Login instead."}), 400
        salt = uuid.uuid4().hex
        user = {
            "id": uuid.uuid4().hex,
            "name": name,
            "email": email,
            "salt": salt,
            "passwordHash": hash_password(password, salt),
            "token": uuid.uuid4().hex,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        users.append(user)
        save_users(users)
    return jsonify({"ok": True, "author": public_author(user)})


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(force=True, silent=True) or {}
    email = normalize_author_email(data.get("email") or "")
    password = str(data.get("password") or "")
    with _users_lock:
        users = load_users()
        user = next((item for item in users if normalize_author_email(item.get("email", "")) == email), None)
        if not user or user.get("passwordHash") != hash_password(password, user.get("salt", "")):
            return jsonify({"error": "Invalid email or password"}), 401
        user["token"] = uuid.uuid4().hex
        save_users(users)
    return jsonify({"ok": True, "author": public_author(user)})


@app.route("/api/projects/list", methods=["POST"])
def list_projects():
    data = request.get_json(force=True, silent=True) or {}
    author_email, _ = author_from_request(data)
    with _projects_lock:
        projects = [
            item for item in load_projects()
            if normalize_author_email(item.get("authorEmail", "")) == author_email
        ]
    projects.sort(key=lambda item: item.get("completedAt") or item.get("updatedAt") or "", reverse=True)
    return jsonify({"projects": projects})


@app.route("/api/projects/save", methods=["POST"])
def save_project():
    data = request.get_json(force=True, silent=True) or {}
    payload = data.get("project") if isinstance(data.get("project"), dict) else data
    author_email, author_name = author_from_request({**data, **payload})
    payload = {**payload, "authorEmail": author_email, "authorName": author_name}
    project = sanitize_project_payload(payload)
    with _projects_lock:
        projects = load_projects()
        idx = next(
            (
                i for i, item in enumerate(projects)
                if str(item.get("projectId") or item.get("id")) == project["projectId"]
                and normalize_author_email(item.get("authorEmail", "")) == project["authorEmail"]
            ),
            -1,
        )
        if idx >= 0:
            project["createdAt"] = projects[idx].get("createdAt") or project["createdAt"]
            projects[idx] = {**projects[idx], **project}
        else:
            projects.append(project)
        projects.sort(key=lambda item: item.get("completedAt") or item.get("updatedAt") or "", reverse=True)
        save_projects(projects)
    return jsonify({"ok": True, "project": project})


@app.route("/api/projects/delete", methods=["POST"])
def delete_project():
    data = request.get_json(force=True, silent=True) or {}
    project_id = str(data.get("project_id") or data.get("projectId") or data.get("id") or "")
    author_email, _ = author_from_request(data)
    if not project_id:
        return jsonify({"error": "No project id provided"}), 400
    with _projects_lock:
        projects = load_projects()
        kept = [
            item for item in projects
            if not (
                str(item.get("projectId") or item.get("id")) == project_id
                and normalize_author_email(item.get("authorEmail", "")) == author_email
            )
        ]
        save_projects(kept)
    return jsonify({"ok": True})


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "No text provided"}), 400
    try:
        return jsonify(_run_analyze_payload(data))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/preview-check", methods=["POST"])
def preview_check():
    """Live spelling check for preview  does not change manuscript text."""
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    locale = data.get("locale", "en-US")
    if not text.strip():
        return jsonify({"text": "", "spelling_issues": [], "spelling_count": 0})
    try:
        return jsonify(engine.spell_check_preview(text, locale))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/fix", methods=["POST"])
def fix():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "No text provided"}), 400
    try:
        return jsonify(_run_fix_payload(data))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    ext = Path(f.filename).suffix.lower()
    if ext not in ALLOWED:
        return jsonify({"error": f"Unsupported type {ext}. Use TXT, DOCX, or PDF."}), 400
    try:
        data = f.read()
        if not data:
            return jsonify({"error": "Uploaded file is empty."}), 400
        text = extract_text(f.filename, data)
        try:
            metadata = extract_metadata(f.filename, data)
        except Exception:
            metadata = {}
        if not text.strip():
            return jsonify({
                "error": (
                    "No readable text in this file. "
                    "For PDFs, use a file with selectable text (not a scanned image)."
                ),
            }), 400
        page_count = ensure_page_limit(text, int(metadata.get("page_count") or 0) or None)
        metadata["page_count"] = page_count
        return jsonify({
            "text": text,
            "filename": secure_filename(f.filename),
            "metadata": metadata,
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Could not read file: {e}"}), 500


@app.route("/api/export/txt", methods=["POST"])
def export_txt():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "No manuscript text to export"}), 400
    try:
        ensure_page_limit(text)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    title = data.get("title", "")
    author = data.get("author", "")
    chapter = data.get("chapter", "")
    content = build_txt_content(title, author, chapter, text)
    raw = content.encode("utf-8")
    if len(raw) > MAX_MB * 1024 * 1024:
        return jsonify({"error": limit_message()}), 400
    buf = io.BytesIO(raw)
    buf.seek(0)
    fname = secure_filename((title or "manuscript").replace(" ", "_")) + ".txt"
    return send_file(buf, as_attachment=True, download_name=fname, mimetype="text/plain")


@app.route("/api/export/docx", methods=["POST"])
def export_docx():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "No manuscript text to export"}), 400
    try:
        ensure_page_limit(text)
        raw = build_docx_bytes(
            data.get("title", ""),
            data.get("author", ""),
            data.get("chapter", ""),
            text,
            font_size=int(data.get("font_size", 11)),
            font_name=data.get("body_font", "Times New Roman"),
            line_height=float(data.get("line_height", 1.25)),
            text_align=data.get("text_align", "justify"),
            margin=float(data.get("margin", 20)),
            page_width=float(data.get("page_width", 148)),
            page_height=float(data.get("page_height", 210)),
            page_unit=data.get("page_unit", "mm"),
        )
        if len(raw) > MAX_MB * 1024 * 1024:
            return jsonify({"error": limit_message()}), 400
        buf = io.BytesIO(raw)
        buf.seek(0)
        fname = secure_filename((data.get("title") or "manuscript").replace(" ", "_")) + ".docx"
        return send_file(
            buf,
            as_attachment=True,
            download_name=fname,
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    use_reloader = DEV_MODE
    mode = "DEV (auto-reload)" if DEV_MODE else "production"
    print("\n  Chaptera - Self Publishing Suite (Python AI)")
    print(f"  Mode: {mode}")
    print(f"  Open in browser: http://127.0.0.1:{port}")
    if DEV_MODE:
        print("  File save  server restarts  browser auto-refreshes")
    print("  Features: proofread  format  download PDF/PNG\n")

    if DEV_MODE and use_reloader and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        browser_flag = BASE / ".dev_browser_opened"
        try:
            browser_flag.unlink(missing_ok=True)
        except OSError:
            pass

    if DEV_MODE and os.environ.get("CHAPTERA_OPEN_BROWSER") == "1":
        import threading
        import urllib.error
        import urllib.request
        import webbrowser

        browser_flag = BASE / ".dev_browser_opened"
        should_open = True
        if use_reloader:
            should_open = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
        if should_open and not browser_flag.exists():

            def _open_browser_when_ready() -> None:
                health_url = f"http://127.0.0.1:{port}/api/health"
                app_url = f"http://127.0.0.1:{port}/"
                for _ in range(120):
                    try:
                        with urllib.request.urlopen(health_url, timeout=1) as resp:
                            if resp.status == 200:
                                webbrowser.open(app_url)
                                try:
                                    browser_flag.write_text("1", encoding="utf-8")
                                except OSError:
                                    pass
                                return
                    except (urllib.error.URLError, TimeoutError, OSError):
                        pass
                    time.sleep(0.25)

            threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    app.run(
        host="0.0.0.0",
        port=port,
        debug=DEV_MODE,
        use_reloader=use_reloader,
        extra_files=collect_watch_files() if DEV_MODE else None,
    )
