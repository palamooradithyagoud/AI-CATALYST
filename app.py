import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

import json
import re
import io
import uuid
import time
import jwt
import threading
import requests
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, jsonify, session, redirect, url_for, g
from flask_cors import CORS
from groq import Groq
from functools import wraps
try:
    from supabase import create_client, Client as SupabaseClient
except ImportError:
    SupabaseClient = None
try:
    from pypdf import PdfReader
    import docx2txt
except ImportError:
    PdfReader = None
    docx2txt = None

try:
    from backend.services.welcome_service import check_and_send_welcome_email
    from backend.utils.email_service import send_welcome_email
except Exception as e:
    print(f"[WARN] Email service import warning: {e}")
    def check_and_send_welcome_email(*args, **kwargs):
        pass
    def send_welcome_email(*args, **kwargs):
        return {"success": False, "error": "Email service unavailable"}

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.secret_key = os.getenv("SECRET_KEY", "skillpath-dev-secret-key-2024")
CORS(app)

# Global ThreadPoolExecutor for async tasks
executor = ThreadPoolExecutor(max_workers=8)

# ──────────────────────────────────────────────
# Task 7: Thread-Safe In-Memory TTL Cache
# ──────────────────────────────────────────────
class TTLCache:
    def __init__(self, default_ttl=600):
        self._cache = {}
        self._lock = threading.Lock()
        self.default_ttl = default_ttl

    def get(self, key):
        with self._lock:
            if key in self._cache:
                value, expires_at = self._cache[key]
                if time.time() < expires_at:
                    return value
                del self._cache[key]
        return None

    def set(self, key, value, ttl=None):
        ttl_val = ttl if ttl is not None else self.default_ttl
        with self._lock:
            self._cache[key] = (value, time.time() + ttl_val)

    def clear(self):
        with self._lock:
            self._cache.clear()

ttl_cache = TTLCache(default_ttl=600)

# ──────────────────────────────────────────────
# Task 5: Singleton Supabase Client Instance
# ──────────────────────────────────────────────
_sb: SupabaseClient = None
_sb_lock = threading.Lock()

def get_sb() -> SupabaseClient:
    """Returns global singleton Supabase client instance."""
    global _sb
    if _sb is None and SupabaseClient:
        with _sb_lock:
            if _sb is None:
                url = os.getenv("SUPABASE_URL", "")
                key = os.getenv("SUPABASE_SERVICE_KEY", "")
                if url and key:
                    try:
                        _sb = create_client(url, key)
                        print("[DB] Singleton Supabase client initialized.")
                    except Exception as e:
                        print(f"[DB] Supabase init failed: {e}")
    return _sb

# Eagerly initialize Supabase client at startup
get_sb()

# ──────────────────────────────────────────────
# Task 4: Detailed Request Performance Logging Middleware
# ──────────────────────────────────────────────
@app.before_request
def before_request_perf():
    g.start_time = time.time()
    g.auth_time = 0.0
    g.db_time = 0.0
    g.ext_api_time = 0.0
    g.serialization_time = 0.0

@app.after_request
def after_request_perf(response):
    if hasattr(g, 'start_time'):
        total_time_ms = round((time.time() - g.start_time) * 1000, 2)
        auth_time_ms = round(getattr(g, 'auth_time', 0.0), 2)
        db_time_ms = round(getattr(g, 'db_time', 0.0), 2)
        ext_api_time_ms = round(getattr(g, 'ext_api_time', 0.0), 2)
        ser_time_ms = max(0.0, round(total_time_ms - (auth_time_ms + db_time_ms + ext_api_time_ms), 2))
        
        log_line = (
            f"[PERF] {request.method} {request.path} | Status: {response.status_code} | "
            f"Total: {total_time_ms}ms (Auth: {auth_time_ms}ms, DB: {db_time_ms}ms, "
            f"ExtAPI: {ext_api_time_ms}ms, Serialization: {ser_time_ms}ms)"
        )
        print(log_line)
        
        if total_time_ms > 500:
            print(f"[PERF WARNING] Endpoint {request.method} {request.path} exceeded SLA threshold: {total_time_ms}ms > 500ms")
            
    return response

# ──────────────────────────────────────────────
# Task 1: Secure Local JWT Verification Middleware
# ──────────────────────────────────────────────
class AuthenticatedUser:
    """Dict/Object adapter for decoded JWT payload."""
    def __init__(self, payload):
        self.id = payload.get("sub") or payload.get("id") or "anonymous"
        self.email = payload.get("email") or "guest@example.com"
        self.role = payload.get("role") or "authenticated"
        self.user_metadata = payload.get("user_metadata") or payload.get("app_metadata") or {}
        self.payload = payload

    def get(self, key, default=None):
        return getattr(self, key, self.payload.get(key, default))

    def __getitem__(self, item):
        return getattr(self, item, self.payload.get(item))

_auth_token_cache = {}  # token -> (user_obj, exp_timestamp)
_jwks_client = None
_jwks_lock = threading.Lock()

def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        with _jwks_lock:
            if _jwks_client is None:
                supabase_url = os.getenv("SUPABASE_URL", "")
                jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
                _jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        t0 = time.time()
        g.user = None
        g.user_id = "anonymous"
        g.user_email = "guest@example.com"
        g.user_role = "anon"
        
        auth_header = request.headers.get("Authorization")
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]
                now = time.time()

                # Check in-memory token cache first (0 ms)
                if token in _auth_token_cache:
                    cached_user, cache_exp = _auth_token_cache[token]
                    if now < cache_exp:
                        g.user = cached_user
                        g.user_id = cached_user.id
                        g.user_email = cached_user.email
                        g.user_role = cached_user.role
                        g.auth_time = (time.time() - t0) * 1000
                        return f(*args, **kwargs)
                    else:
                        del _auth_token_cache[token]

                # Inspect unverified header for algorithm detection
                try:
                    header = jwt.get_unverified_header(token)
                    alg = header.get("alg", "HS256")
                except Exception as e:
                    g.auth_time = (time.time() - t0) * 1000
                    return jsonify({"error": "Malformed authorization header or token", "code": "MALFORMED_TOKEN"}), 401

                verified_user = None

                # HS256 Local Verification (zero network calls)
                jwt_secret = os.getenv("SUPABASE_JWT_SECRET")
                if alg == "HS256" and jwt_secret:
                    try:
                        payload = jwt.decode(
                            token,
                            jwt_secret,
                            algorithms=["HS256"],
                            options={"verify_exp": True, "verify_aud": False}
                        )
                        verified_user = AuthenticatedUser(payload)
                    except jwt.ExpiredSignatureError:
                        g.auth_time = (time.time() - t0) * 1000
                        return jsonify({"error": "Authorization token has expired", "code": "TOKEN_EXPIRED"}), 401
                    except jwt.InvalidTokenError as e:
                        g.auth_time = (time.time() - t0) * 1000
                        return jsonify({"error": f"Invalid token signature: {str(e)}", "code": "INVALID_SIGNATURE"}), 401

                # RS256/ES256 JWKS Verification
                elif alg in ["RS256", "ES256"]:
                    try:
                        jwks = _get_jwks_client()
                        signing_key = jwks.get_signing_key_from_jwt(token)
                        payload = jwt.decode(
                            token,
                            signing_key.key,
                            algorithms=[alg],
                            options={"verify_exp": True, "verify_aud": False}
                        )
                        verified_user = AuthenticatedUser(payload)
                    except jwt.ExpiredSignatureError:
                        g.auth_time = (time.time() - t0) * 1000
                        return jsonify({"error": "Authorization token has expired", "code": "TOKEN_EXPIRED"}), 401
                    except Exception as e:
                        g.auth_time = (time.time() - t0) * 1000
                        return jsonify({"error": f"JWKS verification failed: {str(e)}", "code": "JWKS_ERROR"}), 401

                # Fallback verification & token caching if secret is not explicitly set
                if not verified_user:
                    sb = get_sb()
                    if sb:
                        try:
                            res = sb.auth.get_user(token)
                            if res and res.user:
                                u = res.user
                                payload = {
                                    "sub": u.id,
                                    "email": u.email,
                                    "role": getattr(u, "role", "authenticated"),
                                    "user_metadata": u.user_metadata or {}
                                }
                                verified_user = AuthenticatedUser(payload)
                        except Exception as e:
                            g.auth_time = (time.time() - t0) * 1000
                            return jsonify({"error": "Token verification failed", "code": "AUTH_FAILED"}), 401

                if verified_user:
                    g.user = verified_user
                    g.user_id = verified_user.id
                    g.user_email = verified_user.email
                    g.user_role = verified_user.role
                    
                    # Cache verified token for token exp duration (default 10 mins)
                    token_exp = verified_user.payload.get("exp", now + 600)
                    _auth_token_cache[token] = (verified_user, min(token_exp, now + 600))
                    
                    # Async welcome email check (non-blocking thread)
                    user_name = verified_user.user_metadata.get("full_name") or verified_user.email.split("@")[0].capitalize()
                    executor.submit(
                        check_and_send_welcome_email,
                        user_id=verified_user.id,
                        email=verified_user.email,
                        name=user_name,
                        sb=get_sb()
                    )
                else:
                    g.auth_time = (time.time() - t0) * 1000
                    return jsonify({"error": "Invalid or unverified token", "code": "UNAUTHORIZED"}), 401

        g.auth_time = round((time.time() - t0) * 1000, 2)
        return f(*args, **kwargs)
    return decorated



# ──────────────────────────────────────────────
# DB Helper Functions
# ──────────────────────────────────────────────
def _skill_key(skill: str, level: str = "Beginner", language: str = "English") -> str:
    key_str = f"{skill}_{level}_{language}"
    return re.sub(r'[^a-z0-9]', '_', key_str.lower().strip())

def db_get_cached_skill(skill: str, level: str = "Beginner", language: str = "English"):
    """Step 1: Check DB cache first. Returns full response_data dict or None."""
    try:
        sb = get_sb()
        if not sb: return None
        key = _skill_key(skill, level, language)
        res = sb.table("skills_cache").select("*").eq("skill_key", key).limit(1).execute()
        if res.data:
            row = res.data[0]
            # Increment search counter asynchronously
            sb.table("skills_cache").update({"total_searches": row["total_searches"] + 1}).eq("id", row["id"]).execute()
            print(f"[DB] Cache HIT for '{skill} ({level} - {language})' (tier {row['tier']}, {row['total_searches']} searches)")
            return {
                "tier": 0,  # 0 = DB cache hit
                "skill": skill,
                "recommendations": row.get("recommendations"),
                "fallback_playlists": row.get("fallback_playlists") or [],
                "fallback_certs": row.get("fallback_certs") or [],
                "roadmap": row.get("roadmap"),
                "cache_hit": True,
                "total_searches": row["total_searches"] + 1
            }
    except Exception as e:
        print(f"[DB] Cache lookup failed: {e}")
    return None

def db_save_skill(skill: str, level: str, language: str, tier: int, source: str, response_data: dict):
    """Step 5: Persist result to DB for future instant retrieval."""
    try:
        sb = get_sb()
        if not sb: return
        key = _skill_key(skill, level, language)
        row = {
            "skill_name": f"{skill} ({level} - {language})",
            "skill_key": key,
            "tier": tier,
            "source_type": source,
            "recommendations": response_data.get("recommendations"),
            "fallback_playlists": response_data.get("fallback_playlists") or [],
            "fallback_certs": response_data.get("fallback_certs") or [],
            "roadmap": response_data.get("roadmap"),
            "total_searches": 1
        }
        sb.table("skills_cache").upsert(row, on_conflict="skill_key").execute()
        print(f"[DB] Saved '{skill} ({level} - {language})' to cache (tier={tier}, source={source})")
    except Exception as e:
        print(f"[DB] Save failed: {e}")

def db_log_recommendation(skill: str, tier: int, source: str, data: dict, session_id: str = None):
    """Step 5: Log every recommendation for analytics."""
    try:
        sb = get_sb()
        if not sb: return
        sb.table("recommendation_history").insert({
            "skill_name": skill,
            "tier": tier,
            "source_type": source,
            "recommendations_json": data,
            "roadmap_generated": bool(data.get("roadmap")),
            "session_id": session_id or "anonymous"
        }).execute()
    except Exception as e:
        print(f"[DB] Log recommendation failed: {e}")

def db_upsert_trust_score(resource_url: str, title: str, channel: str, skill: str):
    """Initialize trust score for a new resource."""
    try:
        sb = get_sb()
        if not sb: return
        sb.table("trust_score_engine").upsert({
            "resource_url": resource_url,
            "resource_title": title,
            "channel_name": channel,
            "skill_name": skill,
            "trust_score": 50.0,
            "confidence_score": 50.0
        }, on_conflict="resource_url").execute()
    except Exception as e:
        print(f"[DB] Trust score upsert failed: {e}")

def db_adjust_trust_score(resource_url: str, action: str):
    """Step 7: Auto-improve trust scores based on user actions."""
    try:
        sb = get_sb()
        if not sb: return
        res = sb.table("trust_score_engine").select("*").eq("resource_url", resource_url).limit(1).execute()
        if not res.data: return
        row = res.data[0]
        delta_map = {"click": (+2, +1), "save": (+5, +3), "ignore": (-3, -2), "complete": (+10, +8)}
        dt, dc = delta_map.get(action, (0, 0))
        new_trust = max(0, min(100, row["trust_score"] + dt))
        new_conf  = max(0, min(100, row["confidence_score"] + dc))
        count_key = f"{action}_count"
        new_count = row.get(count_key, 0) + 1
        sb.table("trust_score_engine").update({
            "trust_score": new_trust,
            "confidence_score": new_conf,
            count_key: new_count
        }).eq("resource_url", resource_url).execute()
        print(f"[DB] Trust score updated for {resource_url}: {row['trust_score']} → {new_trust}")
    except Exception as e:
        print(f"[DB] Trust score update failed: {e}")

# ──────────────────────────────────────────────
# 0. Resume Parsing Helpers
# ──────────────────────────────────────────────
def extract_text_from_file(file) -> str:
    """Extracts text from PDF or DOCX files."""
    if not PdfReader or not docx2txt:
        print("[ERROR] Dependencies missing: pypdf or docx2txt not installed.")
        return ""
    
    filename = file.filename.lower()
    try:
        if filename.endswith(".pdf"):
            reader = PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
        elif filename.endswith(".docx"):
            return docx2txt.process(file).strip()
        elif filename.endswith(".doc"):
            return docx2txt.process(file).strip()
        else:
            return file.read().decode("utf-8", errors="ignore").strip()
    except Exception as e:
        print(f"[ERROR] Extraction failed for {filename}: {e}")
        return ""

@app.route("/analyze-resume", methods=["POST"])
@token_required
def analyze_resume():
    """Elite AI Resume Evaluator endpoint."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    role = request.form.get("role", "Software Engineer")
    level = request.form.get("level", "Experienced")
    benchmark = request.form.get("benchmark", "Average Company")
    
    resume_text = extract_text_from_file(file)
    if not resume_text:
        return jsonify({"error": "Failed to extract text from resume. Ensure it is a valid PDF or DOCX."}), 400

    prompt = f"""
You are an expert ATS Resume Reviewer and Hiring Manager with 15+ years of experience across tech roles.
Your task is to analyze a candidate's resume against a TARGET ROLE and provide a brutally honest, high-quality, actionable review.

INPUTS:
Target Role: {role}
Benchmark Standard: {benchmark} (FAANG > Tier-1 Startup > Average Company)
Resume Content: {resume_text}

---

EVALUATION FRAMEWORK:
1. ATS COMPATIBILITY: Keyword optimization, missing critical keywords, formatting issues. (Score 0-10)
2. ROLE ALIGNMENT: Match to target role, irrelevant content, missing role-specific skills. (Score 0-10)
3. IMPACT & ACHIEVEMENTS: Result-driven vs task-based, quantification (metrics/numbers). (Score 0-10)
4. STRUCTURE & CLARITY: Readability, flow, section ordering, conciseness. (Score 0-10)
5. SKILLS & PROJECTS ANALYSIS: Relevance, depth, suggestions for missing projects.

---

OUTPUT FORMAT (STRICT JSON ONLY):
{{
  "final_score": number (0-10),
  "hire_verdict": "Hire / No Hire / Borderline",
  "market_positioning": "Bottom 30% / Average / Top 20% / Top 5%",
  
  "ats_simulation": {{
    "keyword_match_score": number (0-100),
    "missing_critical_keywords": ["List important keywords missing for the target role"],
    "ats_pass_probability": "Low / Medium / High"
  }},

  "recruiter_snap_judgment": {{
    "first_impression": "Brutally honest 10-second screener summary",
    "verdict": "Shortlist / Reject",
    "top_reasons": ["List the top 5 critical issues clearly"]
  }},

  "category_breakdown": [
    {{ "category": "ATS Compatibility", "weight": "25%", "score": number, "reason": "Be critical of optimization" }},
    {{ "category": "Role Alignment", "weight": "35%", "score": number, "reason": "Identify irrelevant content vs missing skills" }},
    {{ "category": "Impact", "weight": "25%", "score": number, "reason": "Check for metrics and outcomes vs tasks" }},
    {{ "category": "Structure", "weight": "15%", "score": number, "reason": "Evaluate readability and flow" }}
  ],

  "brutal_analysis": {{
    "summary": "2-3 line direct overall evaluation",
    "competition_comparison": "Why would I pick someone else over this candidate?"
  }},

  "what_works": ["Identify what few things actually stand out"],
  
  "rejection_risk": {{
    "reason": "Step-by-step actions to improve the resume"
  }},

  "action_plan": {{
    "project_ideas": [
        {{ "title": "", "description": "", "stack": "", "outcome": "" }}
    ],
    "tools_to_learn": ["Specific certifications or tools to add"],
    "bullet_rewrites": [
        {{ "original": "Weak bullet point", "improved": "Quantified, result-driven rewrite" }}
    ]
  }}
}}

STRICT RULES:
- Be brutally honest, avoid generic praise.
- Give specific rewrites, not vague suggestions.
- Focus on impact, metrics, and role relevance.
- Assume this resume is competing at a top 10% level.
- If the resume domain doesn't match the target role, FAIL it immediately (Hire Verdict: No Hire, Score < 4).
"""


    try:
        client = Groq()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a brutal, expert hiring manager. You hate sugarcoating and generic resumes. You penalize heavily for domain mismatches and lack of evidence."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        analysis = json.loads(completion.choices[0].message.content.strip())

        # Save analysis to Supabase
        sb = get_sb()
        user_id = g.user_id
        if sb and user_id:
            try:
                sb.table("resume_analysis").insert({
                    "user_id": user_id,
                    "resume_file_url": file.filename or "uploaded_resume",
                    "ats_score": int(analysis.get("final_score", 0) * 10),
                    "ai_feedback": {
                        "verdict": analysis.get("hire_verdict", "No Hire"),
                        "ats_pass_probability": analysis.get("ats_simulation", {}).get("ats_pass_probability", "Low")
                    },
                    "improvement_suggestions": analysis.get("action_plan")
                }).execute()
            except Exception as e:
                print(f"[DB] Save resume analysis failed: {e}")

        return jsonify(analysis)
    except Exception as e:
        print(f"[ERROR] AI Analysis failed: {e}")
        return jsonify({"error": "AI Evaluation failed. Please try again."}), 500
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CERT_DIR = os.path.join(DATA_DIR, "certifications")
LEETCODE_DIR = os.path.join(DATA_DIR, "leetcode-companywise-interview-questions-master")

# Global Index: problem_link -> { 'name': str, 'companies': list }
LEETCODE_INDEX: dict[str, dict] = {}

def build_leetcode_index():
    """Scans all company CSVs to build a global cross-reference index."""
    if not os.path.exists(LEETCODE_DIR):
        print("[WARN] LeetCode directory not found.")
        return
    
    print("[INFO] Building LeetCode global index...")
    for company in os.listdir(LEETCODE_DIR):
        comp_path = os.path.join(LEETCODE_DIR, company)
        if not os.path.isdir(comp_path): continue
        
        csv_path = os.path.join(comp_path, "all.csv")
        if os.path.exists(csv_path):
            try:
                df = pd.read_csv(csv_path)
                for _, row in df.iterrows():
                    link = str(row.get("URL", "")).strip()
                    name = str(row.get("Title", "")).strip()
                    if not link: continue
                    
                    if link not in LEETCODE_INDEX:
                        LEETCODE_INDEX[link] = {"name": name, "companies": []}
                    
                    if company not in LEETCODE_INDEX[link]["companies"]:
                        LEETCODE_INDEX[link]["companies"].append(company)
            except Exception as e:
                print(f"[WARN] Failed to index {company}: {e}")
    print(f"[INFO] Index built: {len(LEETCODE_INDEX)} unique problems.")

# Build index once
build_leetcode_index()

# Map normalised skill slug → DataFrame
PLAYLIST_DB: dict[str, pd.DataFrame] = {}
CERT_DB:     dict[str, pd.DataFrame] = {}

CSV_SKILL_MAP = {
    "c_datastructures_tutorials.csv": ["c data structures", "data structures in c", "c datastructures"],
    "cpp_tutorials.csv":              ["c++", "cpp", "cplusplus", "c plus plus"],
    "dsa_in_cpp.csv":                 ["dsa in c++", "dsa cpp", "data structures algorithms c++", "dsa in cpp"],
    "dsa_in_java.csv":                ["dsa in java", "dsa java", "data structures algorithms java"],
    "dsa_in_python__1_.csv":          ["dsa in python", "dsa python", "data structures algorithms python"],
    "java_tutorials.csv":             ["java", "java programming", "java tutorials"],
    "python_tutorials.csv":           ["python", "python programming", "python tutorials"],
}

# Add certification files to the map
CERT_SKILL_MAP = {
    "Top_10_Python_Certifications-v2.csv": ["python", "python programming"],
    "Top_10_Java_Certifications-v4.csv":   ["java", "java programming"],
    "Top_10_CPP_Certifications-v3.csv":    ["c++", "cpp", "cplusplus"],
    "Top_10_C_Certifications-v2.csv":      ["c", "c programming"],
}

def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower().strip())

# Initialize Playlists
for filename, aliases in CSV_SKILL_MAP.items():
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            df = pd.read_csv(path)
            df = df.loc[:, ~df.columns.str.contains("link_status", case=False)]
            for alias in aliases:
                PLAYLIST_DB[_normalize(alias)] = df
        except Exception as e:
            print(f"[WARN] Playlist load error {filename}: {e}")

# Initialize Certifications
if os.path.exists(CERT_DIR):
    for filename, aliases in CERT_SKILL_MAP.items():
        path = os.path.join(CERT_DIR, filename)
        if os.path.exists(path):
            try:
                df = pd.read_csv(path)
                for alias in aliases:
                    CERT_DB[_normalize(alias)] = df
            except Exception as e:
                print(f"[WARN] Cert load error {filename}: {e}")

print(f"[INFO] Playlist keys: {list(PLAYLIST_DB.keys())}")
print(f"[INFO] Cert keys: {list(CERT_DB.keys())}")

# ──────────────────────────────────────────────
# 2. Helpers: Row → Dict
# ──────────────────────────────────────────────

def row_to_playlist(row: pd.Series, rank: int) -> dict:
    url = str(row.get("playlist_url", row.get("url", ""))).strip()
    return {
        "rank":           rank,
        "title":          str(row.get("playlist_title", row.get("title", "Untitled"))).strip(),
        "channel":        str(row.get("channel_name",   row.get("channel", "Unknown"))).strip(),
        "level":          str(row.get("level", "All Levels")).strip(),
        "duration_hours": str(row.get("duration_hours", "N/A")).strip(),
        "url":            url,
        "description":    str(row.get("description", "")).strip(),
    }

def row_to_cert(row: pd.Series, rank: int) -> dict:
    return {
        "rank":           rank,
        "title":          str(row.get("Certification / Course Name", "Untitled Cert")).strip(),
        "channel":        str(row.get("Company / Provider", "Educational Provider")).strip(),
        "level":          "All Levels",
        "duration_hours": "Full Course",
        "url":            str(row.get("Link", "#")).strip(),
        "description":    f"Cost: {str(row.get('Cost Structure', 'Contact Provider'))}",
    }

# ──────────────────────────────────────────────
# 3. Helpers: Content Moderation & Search
# ──────────────────────────────────────────────

RESTRICTED_KEYWORDS = [
    "bomb", "weapon", "grenade", "explosion", "murder", "kill", "suicide",
    "drugs", "cocaine", "heroin", "meth", "fentanyl", "marijuana",
    "hack", "bypass", "crack", "ddos", "phishing", "malware", "virus",
    "porn", "sex", "nsfw", "black magic",
    "steal", "shoplifting", "robbery", "scam", "fraud"
]

def is_inappropriate(text: str) -> bool:
    """Checks if the search text contains restricted keywords using word boundaries."""
    if not text:
        return False
    
    text_lower = text.lower()
    for kw in RESTRICTED_KEYWORDS:
        # Use regex to find whole words only (e.g., 'hack' shouldn't block 'biohacking')
        pattern = rf"\b{re.escape(kw)}\b"
        if re.search(pattern, text_lower):
            return True
    return False

LEVEL_KEYWORDS = {
    "beginner":     ["beginner", "basic", "intro", "fundamental", "starter", "all"],
    "intermediate": ["intermediate", "medium", "mid", "moderate", "all"],
    "advanced":     ["advanced", "expert", "pro", "senior", "all"],
}

def _level_matches(row_level: str, requested: str) -> bool:
    rl   = row_level.lower()
    kws  = LEVEL_KEYWORDS.get(requested.lower(), ["all"])
    if "-" in rl or "to" in rl: return True
    return any(k in rl for k in kws)

def filter_by_level(df: pd.DataFrame, level: str) -> pd.DataFrame:
    if not level or level.lower() == "all" or "level" not in df.columns:
        return df
    mask = df["level"].apply(lambda v: _level_matches(str(v), level))
    filtered = df[mask]
    return filtered if not filtered.empty else df

def find_in_db(db: dict, skill: str, map_func, limit=10, level=None):
    normalized = _normalize(skill)
    # Exact match
    if normalized in db:
        df = db[normalized]
        if level: df = filter_by_level(df, level)
        return [map_func(row, i+1) for i, (_, row) in enumerate(df.head(limit).iterrows())]

    # Partial match — word-boundary safe to prevent "c" matching inside "css", etc.
    for key, df in db.items():
        key_pattern        = r'\b' + re.escape(key) + r'\b'
        normalized_pattern = r'\b' + re.escape(normalized) + r'\b'
        if re.search(key_pattern, normalized) or re.search(normalized_pattern, key):
            if level: df = filter_by_level(df, level)
            return [map_func(row, i+1) for i, (_, row) in enumerate(df.head(limit).iterrows())]
    return []

# ──────────────────────────────────────────────
# 4. LLM fallback
# ──────────────────────────────────────────────

SYSTEM_PROMPT = """[ignoring loop detection]
You are a high-end learning resource recommendation engine.
Your ONLY job is to return a JSON object containing two distinct lists — no explanation, no markdown, no code fences.

JSON Structure:
{
  "playlists": [ ... 10 YouTube playlist objects ... ],
  "certificates": [ ... 10 professional certificate course objects (Coursera, Udemy, etc.) ... ]
}

Rules:
1. Return 10 resources for EACH category.
2. Playlists must be direct YouTube playlist links.
3. Certificates must be from reputable platforms (Coursera, edX, Udemy, etc.).

Object format:
{
  "rank": 1,
  "title": "",
  "channel": "",
  "level": "Beginner/Intermediate/Advanced",
  "duration_hours": "",
  "url": "",
  "description": ""
}"""

def llm_fallback(skill: str, level: str, language: str = "English", category: str = "both") -> dict:
    client = Groq()
    
    prompt_instruction = f"Return BOTH top 10 YouTube playlists and top 10 professional certificates for learning {skill} at a {level} level. The results MUST be in {language} language (titles and descriptions should be in {language})."
    if category == "certificates":
        prompt_instruction = f"Return ONLY top 10 professional certificates for learning {skill} ({level}). The results MUST be in {language}. Leave the 'playlists' key as an empty array []."
    elif category == "playlists":
        prompt_instruction = f"Return ONLY top 10 YouTube playlists for learning {skill} ({level}). The results MUST be in {language}. Leave the 'certificates' key as an empty array []."

    user_msg = (
        f"Instruction: {prompt_instruction}\n"
        f"Respond ONLY with a valid JSON object."
    )
    
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_msg}],
            temperature=0.2,
            max_tokens=2048,
        )
        raw = completion.choices[0].message.content.strip()
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw); raw = re.sub(r"\n?```$", "", raw)
        try:
            data = json.loads(raw)
            if not isinstance(data, dict): data = {"playlists": [], "certificates": []}
            return data
        except:
            return {"playlists": [], "certificates": []}
    except Exception as e:
        print(f"[ERROR] llm_fallback failed: {e}")
        return {"playlists": [], "certificates": []}

# ──────────────────────────────────────────────
# 4.5 AI Decision Engine Core
# ──────────────────────────────────────────────
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

def validate_url(url, source="csv"):
    """Validates a URL. For CSV sources, performs HTTP check.
    For YouTube API sources, trusts the API-issued ID (YouTube blocks HEAD requests)."""
    if not url or not url.startswith("http"):
        return False
    
    # YouTube API results: IDs are guaranteed valid by the API itself.
    # YouTube blocks automated HEAD/GET requests so we validate by format only.
    if source == "youtube_api":
        import re
        return bool(re.search(r'(list=[A-Za-z0-9_\-]{10,}|v=[A-Za-z0-9_\-]{10,})', url))
    
    # CSV sources: perform a real HTTP check to catch deleted/broken links
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        res = requests.head(url, timeout=4, allow_redirects=True, headers=headers)
        if res.status_code in [404, 400, 410]:
            print(f"[VALIDATE] Broken CSV link ({res.status_code}): {url}")
            return False
        return True
    except Exception as e:
        print(f"[VALIDATE] CSV link check failed: {e} — {url}")
        # On timeout/connection error, allow it through rather than false-reject
        return True

def fetch_youtube_playlists(skill, level="Beginner", language="English", max_results=10):
    if not YOUTUBE_API_KEY or YOUTUBE_API_KEY == "your_youtube_api_key_here":
        print("[WARN] Invalid YouTube API Key")
        return []
    
    # Construct a descriptive search query incorporating level and language
    query_parts = [skill]
    if level and level.lower() != "all":
        query_parts.append(level)
    query_parts.append("full course tutorial playlist")
    if language and language.lower() != "english":
        query_parts.append(f"in {language}")
        
    query_str = " ".join(query_parts)
    print(f"[YT] Fetching playlists with query: '{query_str}'")
    
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "q": query_str,
        "type": "playlist",
        "maxResults": max_results,
        "key": YOUTUBE_API_KEY
    }
    try:
        response = requests.get(url, params=params)
        data = response.json()
        results = []
        for idx, item in enumerate(data.get("items", [])):
            playlist_id = item["id"].get("playlistId")
            if not playlist_id: continue
            snippet = item.get("snippet", {})
            results.append({
                "id": f"yt_{idx}",
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "description": snippet.get("description", ""),
                "url": f"https://www.youtube.com/playlist?list={playlist_id}"
            })
        return results
    except Exception as e:
        print(f"[ERROR] YouTube API fetch failed: {e}")
        return []

def analyze_and_rank_resources(youtube_data, skill, level):
    client = Groq()
    system_prompt = """[ignoring loop detection]
You are an elite Tech Career Mentor and AI Recommendation Engine.
I am providing you with a list of YouTube playlists fetched from the API for a specific skill. Each item has an 'id' (e.g., yt_0, yt_1).
Your job is to analyze their titles, channels, and descriptions, and RANK them intelligently into 5 distinct categories.

CRITICAL RULE: DO NOT INVENT URLs or TITLES. You MUST ONLY output the 'selected_id' from the provided list.

RETURN EXACTLY THIS JSON STRUCTURE:
{
  "recommendations": {
    "primary": { "selected_id": "yt_X", "confidence_score": 0, "trust_score": 0, "why_selected": "", "estimated_time": "", "expected_outcome": "" },
    "fast_track": { "selected_id": "yt_X", "confidence_score": 0, "trust_score": 0, "why_selected": "", "estimated_time": "", "expected_outcome": "" },
    "interview": { "selected_id": "yt_X", "confidence_score": 0, "trust_score": 0, "why_selected": "", "estimated_time": "", "expected_outcome": "" },
    "project": { "selected_id": "yt_X", "confidence_score": 0, "trust_score": 0, "why_selected": "", "estimated_time": "", "expected_outcome": "" },
    "advanced": { "selected_id": "yt_X", "confidence_score": 0, "trust_score": 0, "why_selected": "", "estimated_time": "", "expected_outcome": "" }
  }
}
Do NOT return anything else. Ensure the JSON is valid."""

    user_msg = f"Skill: {skill} ({level})\nYouTube Data: {json.dumps(youtube_data)}"
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_msg}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content.strip())
    except Exception as e:
        print(f"[ERROR] Groq ranking failed: {e}")
        return None

def generate_learning_path(skill, level):
    client = Groq()
    system_prompt = """[ignoring loop detection]
You are an elite Tech Career Mentor.
Generate a structured, step-by-step learning roadmap for the given skill.
All texts (titles, descriptions, topics, etc.) MUST be returned in English.
RETURN EXACTLY THIS JSON STRUCTURE:
{
  "roadmap": {
    "beginner": ["Topic 1", "Topic 2", "Topic 3"],
    "intermediate": ["Topic 1", "Topic 2", "Topic 3"],
    "advanced": ["Topic 1", "Topic 2"],
    "projects": [{"name": "", "description": ""}, {"name": "", "description": ""}],
    "certifications": ["Cert 1", "Cert 2"],
    "interview_prep": ["Prep step 1", "Prep step 2"]
  }
}
Do NOT return anything else. Ensure the JSON is valid."""

    user_msg = f"Skill: {skill} ({level})"
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_msg}],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content.strip())
    except Exception as e:
        print(f"[ERROR] Groq roadmap failed: {e}")
        return None

# ──────────────────────────────────────────────
# 5. Main endpoint — 7-Step AI Pipeline
# ──────────────────────────────────────────────

@app.route("/get-resource", methods=["POST"])
@token_required
def get_resource():
    body = request.get_json(silent=True) or {}
    skill    = (body.get("skill") or "").strip()
    level    = (body.get("level") or "Beginner").strip()
    language = (body.get("language") or "English").strip()
    sid      = g.user_id

    if not skill:
        return jsonify({"error": "skill is required"}), 400
    if is_inappropriate(skill):
        return jsonify({"error": "please kindly search appropriate skills"}), 400

    # ── STEP 1: DB Cache (fastest path — zero API cost) ───────────
    cached = db_get_cached_skill(skill, level, language)
    if cached:
        cached["tier_label"] = "⚡ Instant Result: Retrieved from AI Memory"
        return jsonify(cached)

    # ── STEP 2: CSV Check (curated trusted data — English only) ──────────────────
    local_playlists = []
    if language.lower() == "english":
        local_playlists = find_in_db(PLAYLIST_DB, skill, row_to_playlist, level=level)

    if local_playlists:
        def validate_csv_playlists():
            valid = []
            for pl in local_playlists:
                if validate_url(pl.get("url"), source="csv"):
                    pl["verification_status"] = "✅ Verified via CSV"
                    valid.append(pl)
            return valid

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_playlists = executor.submit(validate_csv_playlists)
            future_roadmap   = executor.submit(generate_learning_path, skill, level)
            valid_local_playlists = future_playlists.result()

        if valid_local_playlists:
            certs = find_in_db(CERT_DB, skill, row_to_cert)
            for cert in certs: cert["verification_status"] = "✅ Verified via CSV"

            response_data = {
                "tier": 1, "skill": skill,
                "tier_label": "🚀 Curated Result: Trusted CSV Dataset",
                "recommendations": None,
                "fallback_playlists": valid_local_playlists,
                "fallback_certs": certs, "roadmap": None
            }
            try:
                roadmap_data = future_roadmap.result(timeout=12)
                if roadmap_data:
                    response_data["roadmap"] = roadmap_data.get("roadmap")
            except Exception as e:
                print(f"[TIER1] Roadmap timed out: {e}")

            # ── STEP 5: Save to DB + init trust scores ─────────────
            def _persist():
                db_save_skill(skill, level, language, 1, "csv", response_data)
                db_log_recommendation(skill, 1, "csv", response_data, sid)
                for pl in valid_local_playlists:
                    db_upsert_trust_score(pl.get("url",""), pl.get("title",""), pl.get("channel",""), skill)
            ThreadPoolExecutor(max_workers=1).submit(_persist)

            return jsonify(response_data)

    # ── STEP 3: YouTube API Fallback ──────────────────────────────
    youtube_data = fetch_youtube_playlists(skill, level=level, language=language)
    if not youtube_data:
        return jsonify({"error": "No verified high-quality learning resource found for this skill yet."}), 404

    # ── STEP 4: Groq AI Ranking + Roadmap (parallel) ─────────────
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_rank   = executor.submit(analyze_and_rank_resources, youtube_data, skill, level)
        future_road   = executor.submit(generate_learning_path, skill, level)
        ranking_data  = future_rank.result()
        roadmap_data  = future_road.result()

    final_recommendations = {}
    if ranking_data and "recommendations" in ranking_data:
        for cat, rank_info in ranking_data["recommendations"].items():
            selected_id  = rank_info.get("selected_id")
            verified_item = next((i for i in youtube_data if i["id"] == selected_id), None)
            if not verified_item:
                print(f"[TIER3] Unknown id '{selected_id}', using fallback.")
                verified_item = youtube_data[0] if youtube_data else None
            if not verified_item: continue
            url = verified_item.get("url")
            if validate_url(url, source="youtube_api"):
                rank_info["title"]               = verified_item.get("title")
                rank_info["channel"]             = verified_item.get("channel")
                rank_info["url"]                 = url
                rank_info["verification_status"] = "✅ Verified via YouTube API"
                rank_info.pop("selected_id", None)
                final_recommendations[cat]       = rank_info

    response_data = {
        "tier": 3, "skill": skill,
        "tier_label": "🧠 AI-Ranked Result: Groq Intelligence Engine",
        "recommendations": final_recommendations if final_recommendations else None,
        "fallback_playlists": [],
        "fallback_certs": [], "roadmap": None
    }
    if not final_recommendations:
        for pl in youtube_data:
            pl["verification_status"] = "✅ Verified via YouTube API"
        response_data["fallback_playlists"] = youtube_data
    if roadmap_data:
        response_data["roadmap"] = roadmap_data.get("roadmap")

    # ── STEP 5: Save to DB + init trust scores ────────────────────
    def _persist_yt():
        source = "ai_ranked" if final_recommendations else "youtube_api"
        db_save_skill(skill, level, language, 3, source, response_data)
        db_log_recommendation(skill, 3, source, response_data, sid)
        all_resources = list(final_recommendations.values()) + response_data["fallback_playlists"]
        for r in all_resources:
            db_upsert_trust_score(r.get("url",""), r.get("title",""), r.get("channel",""), skill)
    ThreadPoolExecutor(max_workers=1).submit(_persist_yt)

    return jsonify(response_data)


# ── STEP 6: Click / Save / Ignore Tracking ────────────────────────
@app.route("/track-click", methods=["POST"])
@token_required
def track_click():
    body         = request.get_json(silent=True) or {}
    resource_url = (body.get("resource_url") or "").strip()
    skill_name   = (body.get("skill_name") or "").strip()
    resource_title = body.get("resource_title", "")
    action       = body.get("action", "click")   # click | save | ignore | complete | roadmap_view
    sid          = g.user_id


    if not resource_url or not skill_name:
        return jsonify({"error": "resource_url and skill_name required"}), 400
    if action not in ("click", "save", "ignore", "complete", "roadmap_view"):
        return jsonify({"error": "invalid action"}), 400

    try:
        sb = get_sb()
        if sb:
            # Log raw feedback
            sb.table("user_feedback").insert({
                "session_id": sid, "skill_name": skill_name,
                "resource_url": resource_url, "resource_title": resource_title,
                "action": action
            }).execute()
            # Step 7: Auto-adjust trust score
            db_adjust_trust_score(resource_url, action)
        return jsonify({"status": "ok", "action": action})
    except Exception as e:
        print(f"[TRACK] Failed: {e}")
        return jsonify({"status": "error"}), 500


def extract_leetcode_username(profile_input):
    if not profile_input:
        return ""
    profile_input = profile_input.strip().rstrip("/")
    if "leetcode.com/" in profile_input:
        parts = profile_input.split("leetcode.com/")[-1].split("/")
        if parts[0] == "u" and len(parts) > 1:
            return parts[1]
        return parts[0]
    return profile_input

def fetch_leetcode_graphql_stats(username):
    if not username:
        return None
    url = "https://leetcode.com/graphql"
    payload = {
        "query": """
        query userProblemsSolved($username: String!) {
          matchedUser(username: $username) {
            submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
        }
        """,
        "variables": {"username": username}
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=5)
        if res.status_code == 200:
            data = res.json().get("data", {})
            matched_user = data.get("matchedUser")
            if matched_user:
                ac_submissions = matched_user.get("submitStatsGlobal", {}).get("acSubmissionNum", [])
                stats = {"All": 0, "Easy": 0, "Medium": 0, "Hard": 0}
                for sub in ac_submissions:
                    diff = sub.get("difficulty")
                    count = sub.get("count", 0)
                    if diff in stats:
                        stats[diff] = count
                return stats
    except Exception as e:
        print(f"[LEETCODE] GraphQL fetch failed for {username}: {e}")

    # Fallback 1: Faisal Shohag API
    try:
        print(f"[LEETCODE] Trying Faisal Shohag API fallback for {username}...")
        fallback_url = f"https://leetcode-api-faisalshohag.vercel.app/{username}"
        res = requests.get(fallback_url, timeout=5)
        if res.status_code == 200:
            data = res.json()
            if "totalSolved" in data:
                stats = {
                    "All": data.get("totalSolved", 0),
                    "Easy": data.get("easySolved", 0),
                    "Medium": data.get("mediumSolved", 0),
                    "Hard": data.get("hardSolved", 0)
                }
                print(f"[LEETCODE] Faisal Shohag fallback succeeded: {stats}")
                return stats
    except Exception as e:
        print(f"[LEETCODE] Faisal Shohag fallback failed for {username}: {e}")

    # Fallback 2: Alfa LeetCode API
    try:
        print(f"[LEETCODE] Trying Alfa LeetCode API fallback for {username}...")
        fallback_url2 = f"https://alfa-leetcode-api.onrender.com/{username}/solved"
        res = requests.get(fallback_url2, timeout=5)
        if res.status_code == 200:
            data = res.json()
            if "solvedProblem" in data:
                stats = {
                    "All": data.get("solvedProblem", 0),
                    "Easy": data.get("easySolved", 0),
                    "Medium": data.get("mediumSolved", 0),
                    "Hard": data.get("hardSolved", 0)
                }
                print(f"[LEETCODE] Alfa LeetCode fallback succeeded: {stats}")
                return stats
    except Exception as e:
        print(f"[LEETCODE] Alfa LeetCode fallback failed for {username}: {e}")

    return None

# ── STEP 9: Brutal Mentor Mode ────────────────────────────────────
@app.route("/mentor-mode", methods=["POST"])
@token_required
def mentor_mode():

    body               = request.get_json(silent=True) or {}
    goal               = (body.get("goal") or "").strip()
    current_skills     = (body.get("current_skills") or "").strip()
    leetcode_profile   = (body.get("leetcode_profile") or "").strip()
    github_profile     = (body.get("github_profile") or "").strip()
    codeforces_profile = (body.get("codeforces_profile") or "").strip()
    codementor_profile = (body.get("codementor_profile") or "").strip()

    if not goal:
        return jsonify({"error": "goal is required"}), 400

    user_id = g.user_id
    sb = get_sb()

    # Pre-populate empty profiles from database if they exist
    if sb and user_id:
        try:
            p_res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            if p_res.data:
                db_profile = p_res.data[0]
                if not leetcode_profile: leetcode_profile = db_profile.get("leetcode_profile") or ""
                if not github_profile: github_profile = db_profile.get("github_profile") or ""
                if not codeforces_profile: codeforces_profile = db_profile.get("codeforces_profile") or ""
                if not codementor_profile: codementor_profile = db_profile.get("codementor_profile") or ""
        except Exception as e:
            print(f"[MENTOR] Fetching profile failed: {e}")

    # Fetch in-app performance metrics
    dsa_progress = []
    dsa_stats = None
    resume_score = None
    resume_suggestions = None
    projects = []

    if sb and user_id:
        # 1. Fetch DSA progress list
        try:
            dsa_res = sb.table("learning_progress").select("completed_steps").eq("session_id", user_id).eq("skill_name", "dsa").limit(1).execute()
            if dsa_res.data:
                dsa_progress = dsa_res.data[0].get("completed_steps") or []
        except Exception as e:
            print(f"[MENTOR] Fetching DSA progress failed: {e}")

        # 1b. Fetch DSA summary stats from dsa_progress
        try:
            stats_res = sb.table("dsa_progress").select("*").eq("user_id", user_id).limit(1).execute()
            if stats_res.data:
                dsa_stats = stats_res.data[0]
        except Exception as e:
            print(f"[MENTOR] Fetching DSA stats failed: {e}")

        # 2. Fetch latest Resume analysis
        try:
            resume_res = sb.table("resume_analysis").select("ats_score", "improvement_suggestions").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
            if resume_res.data:
                resume_score = resume_res.data[0].get("ats_score")
                resume_suggestions = resume_res.data[0].get("improvement_suggestions")
        except Exception as e:
            print(f"[MENTOR] Fetching resume failed: {e}")

        # 3. Fetch custom projects portfolio
        try:
            proj_res = sb.table("learning_progress").select("completed_steps").eq("session_id", user_id).eq("skill_name", "user_projects").limit(1).execute()
            if proj_res.data:
                projects = proj_res.data[0].get("completed_steps") or []
        except Exception as e:
            print(f"[MENTOR] Fetching projects failed: {e}")

    # 4. Aggregate DSA progress statistics
    total_count = len(dsa_progress)
    easy_count = 0
    medium_count = 0
    hard_count = 0
    topic_counts = {}

    for item in dsa_progress:
        if isinstance(item, dict):
            diff = (item.get("difficulty") or "Easy").strip().capitalize()
            if "Easy" in diff:
                easy_count += 1
            elif "Med" in diff:
                medium_count += 1
            elif "Hard" in diff:
                hard_count += 1
            else:
                easy_count += 1
            
            topic = (item.get("topic") or "General").strip()
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

    # 5. Fetch live LeetCode stats if profile is provided
    live_leetcode_fetched = False
    if leetcode_profile:
        leetcode_username = extract_leetcode_username(leetcode_profile)
        live_stats = fetch_leetcode_graphql_stats(leetcode_username)
        if live_stats:
            total_count = live_stats.get("All", 0)
            easy_count = live_stats.get("Easy", 0)
            medium_count = live_stats.get("Medium", 0)
            hard_count = live_stats.get("Hard", 0)
            live_leetcode_fetched = True

    if not live_leetcode_fetched and dsa_stats:
        total_count = max(dsa_stats.get("total_solved") or 0, total_count)
        easy_count = max(dsa_stats.get("easy_solved") or 0, easy_count)
        medium_count = max(dsa_stats.get("medium_solved") or 0, medium_count)
        hard_count = max(dsa_stats.get("hard_solved") or 0, hard_count)

    mentor_type = (body.get("mentor_type") or "career").strip().lower()

    client = Groq()
    if mentor_type == "coding":
        system_prompt = """You are an elite AI Career Mentor from a top tech company, integrated into SkillPath.
Your job is to analyze the user's coding standings across their coding profiles (LeetCode, GitHub, Codeforces, Codementor) and their algorithmic (DSA) performance data, and generate a premium, personalized Coding Growth Report.

Strict Rules:
- Never shame the user. Avoid generic criticism. Keep it constructive and encouraging.
- Never use phrases like: "major red flag", "not competitive", "you are lagging badly".
- Always highlight achievements before weaknesses. Convert weaknesses into opportunities/high-impact growth areas.
- Do NOT mention resume ATS score or projects portfolio. Focus EXCLUSIVELY on their coding standings, algorithmic weaknesses, and profiles.

RETURN EXACTLY THIS JSON:
{
  "performance_snapshot": {
    "summary": "An encouraging summary highlighting achievements first (e.g., 'Great progress! You've solved X problems...')",
    "total_solved": 116,
    "difficulty_distribution": "e.g., '90 Easy, 20 Medium, 6 Hard'",
    "contest_participation": "e.g., 'Participated in 2 weekly contests' or description",
    "current_streak": "e.g., '5 days'",
    "strongest_platform": "e.g., 'LeetCode'",
    "growth_score": 68,
    "level": "Emerging Problem Solver"
  },
  "strengths": [
    {
      "title": "Name of strength (e.g., Strong consistency in solving Easy and Medium problems)",
      "why": "Explanation of WHY this is a strength"
    }
  ],
  "high_impact_growth_areas": {
    "critical": ["topic1", "topic2"],
    "important": ["topic3", "topic4"],
    "optional": ["topic5", "topic6"]
  },
  "interview_readiness": {
    "internships": 82,
    "service_companies": 76,
    "product_companies": 58,
    "faang_level": 34,
    "next_level_needs": "Explain what is needed to move to the next level"
  },
  "roadmap_30_day": {
    "week_1": ["Solve 2 Array problems daily", "Learn Linked Lists", "Maintain streak"],
    "week_2": ["action3", "action4"],
    "week_3": ["action5", "action6"],
    "week_4": ["action7", "action8"]
  },
  "ai_insights": [
    "Intelligent observation 1 (e.g., 'You perform better in structured topics than exploratory contests.')",
    "Intelligent observation 2"
  ],
  "motivation": "A personalized motivational message (inspiring but realistic)",
  "visual_dashboard_cards": {
    "achievement_card": "🏆 Achievement Card content with emoji",
    "growth_score_card": "📈 Growth Score Card content with emoji",
    "interview_readiness_card": "🎯 Interview Readiness Card content with emoji",
    "next_milestone_card": "⚡ Next Milestone Card content with emoji",
    "roadmap_card": "🗓 30-Day Roadmap Card content with emoji",
    "streak_card": "🔥 Streak Card content with emoji"
  }
}
Return only valid JSON."""
    else:
        system_prompt = """You are a brutally honest, elite Tech Career Mentor.
Your job is to give harsh, direct, actionable career advice.
Be specific. Call out wasted time. Redirect focus.
Never be gentle. Be like a senior engineer who wants the person to actually succeed.

Evaluate the candidate's coding profiles (e.g., LeetCode, GitHub, Codeforces, Codementor) if they are provided, AND analyze their in-app learning activity, DSA progress, and project portfolio.
Contrast their performance metrics against their target career goal:
- Identify specifically where they are lagging behind:
  - If their solved DSA count is low (e.g. less than 50-100 solved problems), critique their lack of consistency.
  - If their resume ATS score is low (e.g. less than 80) or no resume is uploaded, call them out on not having a recruiter-ready resume.
  - If they have very few projects (e.g. less than 2-3 custom projects), criticize their practical developer portfolio.
  - Assess their profile handles (if provided) and explain what standing they need to target (e.g., LeetCode patterns, GitHub repository depth, Codeforces rating, Codementor reviews).
- Provide concrete, step-by-step suggestions on how they can improve their profile standing, overcome their weaknesses, and how to execute each suggestion better.

RETURN EXACTLY THIS JSON:
{
  "verdict": "one harsh sentence about their current path",
  "wasted_time": ["skill1", "skill2"],
  "must_learn_now": [{"skill": "", "reason": ""}],
  "lagging_areas": ["detailed list of where they are lagging behind based on their profiles, skills and goals"],
  "improvement_suggestions": [{"action": "What they must do", "how_to_do_better": "Actionable, step-by-step instructions on how to do this action better"}],
  "priority_order": ["step1", "step2", "step3", "step4", "step5"],
  "brutal_truth": "2-3 sentence reality check paragraph",
  "action_this_week": "exact 1 thing they must do this week"
}
Return only valid JSON."""

    if mentor_type == "coding":
        user_content = "Please audit my coding standings and technical profile depth."
        if leetcode_profile:
            user_content += f"\nLeetCode Handle/URL: {leetcode_profile}"
        else:
            user_content += "\nLeetCode Handle/URL: Not configured"

        if github_profile:
            user_content += f"\nGitHub Handle/URL: {github_profile}"
        else:
            user_content += "\nGitHub Handle/URL: Not configured"

        if codeforces_profile:
            user_content += f"\nCodeforces Handle/URL: {codeforces_profile}"
        else:
            user_content += "\nCodeforces Handle/URL: Not configured"

        if codementor_profile:
            user_content += f"\nCodementor Handle/URL: {codementor_profile}"
        else:
            user_content += "\nCodementor Handle/URL: Not configured"

        user_content += f"\n\nIn-App Algorithmic (DSA) Stats:"
        user_content += f"\n- Total Solved Questions: {total_count}"
        user_content += f"\n- Easy Solved: {easy_count}"
        user_content += f"\n- Medium Solved: {medium_count}"
        user_content += f"\n- Hard Solved: {hard_count}"
        
        if topic_counts:
            topics_summary = ", ".join([f"{t} ({c} questions)" for t, c in topic_counts.items()])
            user_content += f"\n- Solved Topics Distribution: {topics_summary}"
        else:
            user_content += "\n- Solved Topics Distribution: None recorded"

        if dsa_progress:
            titles = [(item.get("name") or item.get("title")) for item in dsa_progress if isinstance(item, dict) and (item.get("name") or item.get("title"))]
            if titles:
                user_content += f"\n- Solved Question List: {', '.join(titles)}"
    else:
        user_content = f"My goal: {goal}\nMy current skills: {current_skills}"
        if leetcode_profile:
            user_content += f"\nLeetCode Profile: {leetcode_profile}"
        if github_profile:
            user_content += f"\nGitHub Profile: {github_profile}"
        if codeforces_profile:
            user_content += f"\nCodeforces Profile: {codeforces_profile}"
        if codementor_profile:
            user_content += f"\nCodementor Profile: {codementor_profile}"

        user_content += f"\n\nIn-App Learning & Performance Metrics:"
        user_content += f"\n- DSA Progress: User has solved {len(dsa_progress)} practice problems inside the app."
        if dsa_progress:
            titles = [(item.get("name") or item.get("title")) for item in dsa_progress if isinstance(item, dict) and (item.get("name") or item.get("title"))]
            if titles:
                user_content += f" (Problems solved: {', '.join(titles[:15])}{'...' if len(titles) > 15 else ''})"

        if resume_score is not None:
            user_content += f"\n- Latest Resume Evaluation: ATS Score is {resume_score}/100."
            if resume_suggestions:
                tools = resume_suggestions.get("tools_to_learn", [])
                if tools:
                    user_content += f" (Suggestions to learn: {', '.join(tools[:5])})"
        else:
            user_content += f"\n- Latest Resume Evaluation: No resume uploaded yet in the app."

        user_content += f"\n- Project Portfolio: User has configured {len(projects)} custom projects in their workspace."
        if projects:
            proj_titles = [p.get("title") for p in projects if isinstance(p, dict) and p.get("title")]
            user_content += f" (Projects: {', '.join(proj_titles)})"

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.4,
            response_format={"type": "json_object"}
        )
        result = json.loads(completion.choices[0].message.content.strip())
        return jsonify(result)
    except Exception as e:
        print(f"[MENTOR] Groq failed: {e}")
        return jsonify({"error": "Mentor mode unavailable"}), 500



# ──────────────────────────────────────────────
# 5b. Get Real Playlist Videos from YouTube API
# ──────────────────────────────────────────────

@app.route("/get-playlist-videos", methods=["GET"])
def get_playlist_videos():
    """
    Fetch real video titles from a YouTube playlist using the YouTube Data API.
    Query param: playlist_url=https://www.youtube.com/playlist?list=XXXXX
    Returns: { videos: [{id, title, videoId, position}], total: N }
    """
    playlist_url = request.args.get("playlist_url", "")
    if not playlist_url:
        return jsonify({"error": "playlist_url param required"}), 400

    # Extract playlist ID from URL
    match = re.search(r'list=([A-Za-z0-9_\-]+)', playlist_url)
    if not match:
        return jsonify({"error": "Invalid playlist URL"}), 400

    playlist_id = match.group(1)
    cache_key = f"yt_playlist:{playlist_id}"
    cached = ttl_cache.get(cache_key)
    if cached:
        return jsonify(cached)

    if not YOUTUBE_API_KEY or YOUTUBE_API_KEY == "your_youtube_api_key_here":
        return jsonify({"error": "YouTube API key not configured"}), 500

    all_videos = []
    next_page_token = None

    try:
        t0 = time.time()
        while True:
            params = {
                "part": "snippet",
                "playlistId": playlist_id,
                "maxResults": 50,
                "key": YOUTUBE_API_KEY
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            res = requests.get(
                "https://www.googleapis.com/youtube/v3/playlistItems",
                params=params,
                timeout=10
            )

            if res.status_code != 200:
                print(f"[YT API ERROR] Status {res.status_code}: {res.text[:200]}")
                break

            data = res.json()
            items = data.get("items", [])

            for item in items:
                snippet = item.get("snippet", {})
                resource_id = snippet.get("resourceId", {})
                video_id = resource_id.get("videoId", "")
                title = snippet.get("title", "")
                position = snippet.get("position", 0)

                if title and title != "Private video" and title != "Deleted video":
                    all_videos.append({
                        "id": len(all_videos) + 1,
                        "title": title,
                        "videoId": video_id,
                        "position": position
                    })

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

        g.ext_api_time = (time.time() - t0) * 1000
        res_payload = {"videos": all_videos, "total": len(all_videos)}
        ttl_cache.set(cache_key, res_payload, ttl=600)
        return jsonify(res_payload)
    except Exception as e:
        print(f"[YT API EXCEPTION] {e}")
        return jsonify({"error": str(e)}), 500


# ──────────────────────────────────────────────
# 6. Interview Prep (LeetCode)
# ──────────────────────────────────────────────

@app.route("/get-companies", methods=["GET"])
def get_companies():
    """Returns a sorted list of all available companies."""
    try:
        if not os.path.exists(LEETCODE_DIR):
            return jsonify([])
        companies = [d for d in os.listdir(LEETCODE_DIR) if os.path.isdir(os.path.join(LEETCODE_DIR, d))]
        return jsonify(sorted(companies))
    except Exception as e:
        print(f"[ERROR] get-companies: {e}")
        return jsonify([]), 500

@app.route("/get-questions", methods=["GET"])
def get_questions():
    """Returns questions for a specific company."""
    company = request.args.get("company", "").strip()
    if not company:
        return jsonify({"error": "company name is required"}), 400
    
    csv_path = os.path.join(LEETCODE_DIR, company, "all.csv")
    if not os.path.exists(csv_path):
        return jsonify({"error": f"Data for {company} not found"}), 404
    
    try:
        df = pd.read_csv(csv_path)
        questions = []
        for i, row in df.iterrows():
            link = str(row.get("URL", "")).strip()
            if not link: continue
            
            # Enrich with cross-company data from the global index
            global_data = LEETCODE_INDEX.get(link, {})
            other_companies = [c for c in global_data.get("companies", []) if str(c).lower() != str(company).lower()]
            
            questions.append({
                "id":           str(row.get("ID", "")).strip(),
                "title":        str(row.get("Title", "")).strip(),
                "url":          link,
                "difficulty":   str(row.get("Difficulty", "")).strip(),
                "acceptance":   str(row.get("Acceptance %", "")).strip(),
                "frequency":    str(row.get("Frequency %", "")).strip(),
                "other_companies": other_companies
            })
            
        return jsonify({"company": company, "questions": questions})
    except Exception as e:
        print(f"[ERROR] get-questions {company}: {e}")
        return jsonify({"error": str(e)}), 500

# ──────────────────────────────────────────────
# 7. Auth Routes
# ──────────────────────────────────────────────

@app.route("/login-page")
def login_page():
    return app.send_static_file("login.html")

@app.route("/config", methods=["GET"])
def get_config():
    return jsonify({
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_ANON_KEY": os.getenv("SUPABASE_ANON_KEY")
    })

@app.route("/logout")
def logout():
    return redirect("/login-page")

@app.route("/get-user-session", methods=["GET"])
@token_required
def get_user_session():
    if not g.user or g.user_id == "anonymous":
        return jsonify({
            "logged_in": False,
            "id": "anonymous",
            "email": "guest@example.com",
            "name": "Candidate",
            "college": "",
            "department": "",
            "academic_class": "",
            "target_role": ""
        })

    user_meta = getattr(g.user, "user_metadata", {}) or {}
    name = user_meta.get("full_name") or user_meta.get("name")
    if not name:
        name = g.user_email.split("@")[0].capitalize() if g.user_email else "Candidate"
        
    sb = get_sb()
    profile = {}
    if sb and g.user_id != "anonymous":
        try:
            res = sb.table("profiles").select("*").eq("id", g.user_id).execute()
            if res.data and len(res.data) > 0:
                profile = res.data[0]
            else:
                sb.table("profiles").insert({
                    "id": g.user_id,
                    "full_name": name,
                    "email": g.user_email
                }).execute()
                print(f"[AUTH] Auto-created database profile for user {g.user_id}.")
        except Exception as e:
            print(f"[AUTH] Profile lookup/auto-creation: {e}")

    college = profile.get("college") or ""
    department = profile.get("department") or ""
    academic_class = profile.get("academic_class") or ""

    if profile.get("preferred_learning_path"):
        try:
            pref_data = json.loads(profile.get("preferred_learning_path"))
            if isinstance(pref_data, dict):
                if not college: college = pref_data.get("college") or ""
                if not department: department = pref_data.get("department") or ""
                if not academic_class: academic_class = pref_data.get("academic_class") or ""
        except Exception:
            pass

    return jsonify({
        "logged_in": True,
        "id": g.user_id,
        "email": g.user_email,
        "name": profile.get("full_name") or name,
        "college": college,
        "department": department,
        "academic_class": academic_class,
        "target_role": profile.get("target_role") or "",
        "leetcode_profile": profile.get("leetcode_profile") or "",
        "github_profile": profile.get("github_profile") or "",
        "codeforces_profile": profile.get("codeforces_profile") or "",
        "codementor_profile": profile.get("codementor_profile") or ""
    })


@app.route("/get-latest-resume", methods=["GET"])
@token_required
def get_latest_resume():
    pass
    sb = get_sb()
    if not sb:
        return jsonify(None)
    try:
        res = sb.table("resume_analysis")\
                .select("*")\
                .eq("user_id", g.user_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
        if res.data:
            return jsonify({
                "score": res.data[0].get("ats_score", 85),
                "verdict": res.data[0].get("ai_feedback", {}).get("verdict", "Excellent") if isinstance(res.data[0].get("ai_feedback"), dict) else "Excellent",
                "impact": "Strong",
                "match": res.data[0].get("ai_feedback", {}).get("ats_pass_probability", "High") if isinstance(res.data[0].get("ai_feedback"), dict) else "High",
                "ats": res.data[0].get("ats_score", 85)
            })
        return jsonify(None)
    except Exception as e:
        print(f"[RESUME] Get failed: {e}")
        return jsonify(None)

@app.route("/sync-dsa-progress", methods=["POST"])
@token_required
def sync_dsa_progress():
    pass
    body = request.get_json(silent=True) or {}
    solved_list = body.get("solved_list", [])
    
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        total = len(solved_list)
        easy = len([q for q in solved_list if q.get("difficulty") == "Easy"])
        medium = len([q for q in solved_list if q.get("difficulty") == "Medium"])
        hard = len([q for q in solved_list if q.get("difficulty") == "Hard"])
        
        # Sync to learning_progress
        sb.table("learning_progress").upsert({
            "session_id": g.user_id,
            "skill_name": "dsa",
            "completed_steps": solved_list,
            "completion_pct": min(100.0, float(total) / 500 * 100)
        }, on_conflict="session_id, skill_name").execute()
        
        # Sync to dsa_progress
        dsa_res = sb.table("dsa_progress").select("id").eq("user_id", g.user_id).limit(1).execute()
        dsa_row = {
            "user_id": g.user_id,
            "total_solved": total,
            "easy_solved": easy,
            "medium_solved": medium,
            "hard_solved": hard
        }
        if dsa_res.data:
            sb.table("dsa_progress").update(dsa_row).eq("id", dsa_res.data[0]["id"]).execute()
        else:
            sb.table("dsa_progress").insert(dsa_row).execute()
        
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[DSA] Sync failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/get-dsa-progress", methods=["GET"])
@token_required
def get_dsa_progress():
    pass
    sb = get_sb()
    if not sb:
        return jsonify([])
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "dsa")\
                .limit(1)\
                .execute()
        if res.data:
            return jsonify(res.data[0].get("completed_steps", []))
        return jsonify([])
    except Exception as e:
        print(f"[DSA] Get failed: {e}")
        return jsonify([])


@app.route("/get-leetcode-stats", methods=["GET"])
@token_required
def get_leetcode_stats():
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
    try:
        # Check if profile link was passed as a query parameter
        leetcode_profile = request.args.get("profile")
        
        if not leetcode_profile:
            # Fetch user's profile to get leetcode_profile from DB
            res = sb.table("profiles").select("leetcode_profile").eq("id", g.user_id).single().execute()
            leetcode_profile = res.data.get("leetcode_profile") if res.data else None
            
        if not leetcode_profile:
            return jsonify({"status": "no_profile", "message": "LeetCode profile not configured."})
            
        username = extract_leetcode_username(leetcode_profile)
        stats = fetch_leetcode_graphql_stats(username)
        
        if stats:
            # Sync to profiles table on the backend (service role key bypasses client RLS)
            try:
                sb.table("profiles").update({"leetcode_profile": leetcode_profile}).eq("id", g.user_id).execute()
                print(f"[LEETCODE] Successfully synced profile URL '{leetcode_profile}' to profiles table.")
            except Exception as prof_err:
                print(f"[LEETCODE] Sync to profiles table failed: {prof_err}")

            # Sync to dsa_progress table
            easy = stats.get("Easy", 0)
            medium = stats.get("Medium", 0)
            hard = stats.get("Hard", 0)
            total = stats.get("All", 0)
            
            dsa_res = sb.table("dsa_progress").select("id").eq("user_id", g.user_id).limit(1).execute()
            dsa_row = {
                "user_id": g.user_id,
                "total_solved": total,
                "easy_solved": easy,
                "medium_solved": medium,
                "hard_solved": hard
            }
            if dsa_res.data:
                sb.table("dsa_progress").update(dsa_row).eq("id", dsa_res.data[0]["id"]).execute()
            else:
                sb.table("dsa_progress").insert(dsa_row).execute()
                
            return jsonify({
                "status": "success",
                "username": username,
                "stats": stats,
                "source": "live"
            })
            
        # Fallback to database cached counts if live fetch failed
        dsa_res = sb.table("dsa_progress").select("*").eq("user_id", g.user_id).limit(1).execute()
        if dsa_res.data:
            row = dsa_res.data[0]
            cached_stats = {
                "All": row.get("total_solved", 0),
                "Easy": row.get("easy_solved", 0),
                "Medium": row.get("medium_solved", 0),
                "Hard": row.get("hard_solved", 0)
            }
            return jsonify({
                "status": "success",
                "username": username,
                "stats": cached_stats,
                "source": "cache"
            })
            
        return jsonify({"status": "error", "message": "Failed to fetch stats from LeetCode and no cache found."})
    except Exception as e:
        print(f"[LEETCODE] Endpoint failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/save-profile-details", methods=["POST"])
@token_required
def save_profile_details():
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
    try:
        body = request.get_json(silent=True) or {}
        full_name = body.get("full_name", "").strip()
        college = body.get("college", "").strip()
        department = body.get("department", "").strip()
        academic_class = body.get("academic_class", "").strip()
        target_role = body.get("target_role", "").strip()
        leetcode = body.get("leetcode_profile", "").strip()
        github = body.get("github_profile", "").strip()
        codeforces = body.get("codeforces_profile", "").strip()
        codementor = body.get("codementor_profile", "").strip()

        profile_data = {
            "id": g.user_id,
            "email": g.user_email
        }
        if full_name: profile_data["full_name"] = full_name
        if college: profile_data["college"] = college
        if department: profile_data["department"] = department
        if academic_class: profile_data["academic_class"] = academic_class
        if target_role: profile_data["target_role"] = target_role
        if leetcode: profile_data["leetcode_profile"] = leetcode
        if github: profile_data["github_profile"] = github
        if codeforces: profile_data["codeforces_profile"] = codeforces
        if codementor: profile_data["codementor_profile"] = codementor

        try:
            sb.table("profiles").upsert(profile_data, on_conflict="id").execute()
            print(f"[PROFILES] Saved profile details directly for user {g.user_id}.")
        except Exception as sb_err:
            print(f"[PROFILES] Direct column upsert fallback to JSON: {sb_err}")
            academic_payload = {}
            if college: academic_payload["college"] = college
            if department: academic_payload["department"] = department
            if academic_class: academic_payload["academic_class"] = academic_class

            fallback_data = {
                "id": g.user_id,
                "email": g.user_email,
                "preferred_learning_path": json.dumps(academic_payload)
            }
            if full_name: fallback_data["full_name"] = full_name
            if target_role: fallback_data["target_role"] = target_role
            if leetcode: fallback_data["leetcode_profile"] = leetcode
            if github: fallback_data["github_profile"] = github
            if codeforces: fallback_data["codeforces_profile"] = codeforces
            if codementor: fallback_data["codementor_profile"] = codementor
            sb.table("profiles").upsert(fallback_data, on_conflict="id").execute()
            print(f"[PROFILES] Saved profile details via JSON fallback for user {g.user_id}.")

        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[PROFILES] Save profile details failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/save-coding-profiles", methods=["POST"])
@token_required
def save_coding_profiles():
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
    try:
        body = request.get_json(silent=True) or {}
        leetcode = body.get("leetcode_profile", "").strip()
        github = body.get("github_profile", "").strip()
        codeforces = body.get("codeforces_profile", "").strip()
        codementor = body.get("codementor_profile", "").strip()
        college = body.get("college", "").strip()
        department = body.get("department", "").strip()
        academic_class = body.get("academic_class", "").strip()
        full_name = body.get("full_name", "").strip()
        
        # Upsert profiles table in Supabase
        profile_data = {
            "id": g.user_id,
            "email": g.user_email,
            "leetcode_profile": leetcode,
            "github_profile": github,
            "codeforces_profile": codeforces,
            "codementor_profile": codementor
        }
        if full_name: profile_data["full_name"] = full_name
        if college: profile_data["college"] = college
        if department: profile_data["department"] = department
        if academic_class: profile_data["academic_class"] = academic_class

        try:
            sb.table("profiles").upsert(profile_data, on_conflict="id").execute()
        except Exception as sb_err:
            print(f"[PROFILES] Direct column upsert fallback to JSON: {sb_err}")
            academic_payload = {}
            if college: academic_payload["college"] = college
            if department: academic_payload["department"] = department
            if academic_class: academic_payload["academic_class"] = academic_class

            fallback_data = {
                "id": g.user_id,
                "email": g.user_email,
                "leetcode_profile": leetcode,
                "github_profile": github,
                "codeforces_profile": codeforces,
                "codementor_profile": codementor,
                "preferred_learning_path": json.dumps(academic_payload)
            }
            if full_name: fallback_data["full_name"] = full_name
            sb.table("profiles").upsert(fallback_data, on_conflict="id").execute()
        
        print(f"[PROFILES] Backend successfully upserted Supabase profile for user {g.user_id}.")
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[PROFILES] Backend save failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/sync-user-projects", methods=["POST"])
@token_required
def sync_user_projects():
    pass
    body = request.get_json(silent=True) or {}
    projects_list = body.get("projects_list", [])
    
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        sb.table("learning_progress").upsert({
            "session_id": g.user_id,
            "skill_name": "user_projects",
            "completed_steps": projects_list,
            "completion_pct": 100.0
        }, on_conflict="session_id, skill_name").execute()
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[PROJECTS] Sync failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/get-user-projects", methods=["GET"])
@token_required
def get_user_projects():
    pass
    sb = get_sb()
    if not sb:
        return jsonify([])
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "user_projects")\
                .limit(1)\
                .execute()
        if res.data:
            return jsonify(res.data[0].get("completed_steps", []))
        return jsonify([])
    except Exception as e:
        print(f"[PROJECTS] Get failed: {e}")
        return jsonify([])

def _migrate_video_item(v):
    if not isinstance(v, dict):
        return {
            "id": 1,
            "videoId": "",
            "title": str(v),
            "duration": 0.0,
            "watchTime": 0.0,
            "watchedSeconds": 0.0,
            "completed": False,
            "completedAt": None,
            "lastPosition": 0.0
        }
    return {
        "id": v.get("id", 1),
        "videoId": str(v.get("videoId") or v.get("video_id") or "").strip(),
        "title": v.get("title", "Untitled Video"),
        "duration": float(v.get("duration", 0) or 0),
        "watchTime": float(v.get("watchTime", 0) or 0),
        "watchedSeconds": float(v.get("watchedSeconds", 0) or 0),
        "completed": bool(v.get("completed", False)),
        "completedAt": v.get("completedAt"),
        "lastPosition": float(v.get("lastPosition", 0) or 0)
    }

@app.route("/sync-saved-playlists", methods=["POST"])
@token_required
def sync_saved_playlists():
    body = request.get_json(silent=True) or {}
    playlists_list = body.get("playlists_list", [])
    
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        total_videos = 0
        completed_videos = 0
        for p in playlists_list:
            videos = p.get("videos", [])
            for i, v in enumerate(videos):
                videos[i] = _migrate_video_item(v)
            total_videos += len(videos)
            completed_videos += len([v for v in videos if v.get("completed")])
        
        pct = 0.0
        if total_videos > 0:
            pct = round((completed_videos / total_videos) * 100.0, 2)

        sb.table("learning_progress").upsert({
            "session_id": g.user_id,
            "skill_name": "saved_playlists",
            "completed_steps": playlists_list,
            "completion_pct": pct
        }, on_conflict="session_id, skill_name").execute()
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[PLAYLISTS] Sync failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/get-saved-playlists", methods=["GET"])
@token_required
def get_saved_playlists():
    sb = get_sb()
    if not sb:
        return jsonify([])
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "saved_playlists")\
                .limit(1)\
                .execute()
        if res.data:
            playlists = res.data[0].get("completed_steps", [])
            for p in playlists:
                vids = p.get("videos", [])
                for i, v in enumerate(vids):
                    vids[i] = _migrate_video_item(v)
            return jsonify(playlists)
        return jsonify([])
    except Exception as e:
        print(f"[PLAYLISTS] Get failed: {e}")
        return jsonify([])

@app.route("/watch-progress", methods=["POST"])
@token_required
def watch_progress():
    body = request.get_json(silent=True) or {}
    playlist_url = body.get("playlistUrl") or body.get("playlist_url") or ""
    video_id = str(body.get("videoId") or body.get("video_id") or "").strip()
    last_position = float(body.get("lastPosition") or body.get("last_position") or 0)
    watched_seconds = float(body.get("watchedSeconds") or body.get("watched_seconds") or 0)
    duration = float(body.get("duration") or 0)
    
    if not playlist_url or not video_id:
        return jsonify({"error": "playlistUrl and videoId required"}), 400
        
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "saved_playlists")\
                .limit(1)\
                .execute()
        
        playlists_list = res.data[0].get("completed_steps", []) if res.data else []
        updated = False
        video_completed = False
        completed_at = None
        
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()

        for p in playlists_list:
            if p.get("url") == playlist_url:
                videos = p.get("videos", [])
                for i, v in enumerate(videos):
                    videos[i] = _migrate_video_item(v)
                    v_item = videos[i]
                    target_vid = str(v_item.get("videoId") or v_item.get("id") or "").strip()
                    if target_vid == video_id or str(v_item.get("id")) == video_id:
                        v_item["lastPosition"] = max(v_item.get("lastPosition", 0), last_position)
                        v_item["watchedSeconds"] = max(v_item.get("watchedSeconds", 0), watched_seconds)
                        if duration > 0:
                            v_item["duration"] = duration
                        v_item["watchTime"] = max(v_item.get("watchTime", 0), last_position)
                        
                        # Anti-cheat completion check: 95% position OR end-of-video + 80% genuine watched seconds
                        dur = v_item.get("duration", 0)
                        if dur > 0:
                            ratio = last_position / dur
                            genuine_ratio = v_item.get("watchedSeconds", 0) / dur
                            if (ratio >= 0.95 or last_position >= dur - 5) and (genuine_ratio >= 0.80 or v_item.get("watchedSeconds", 0) >= dur * 0.80):
                                if not v_item.get("completed"):
                                    v_item["completed"] = True
                                    v_item["completedAt"] = now_iso
                                video_completed = v_item["completed"]
                                completed_at = v_item.get("completedAt")
                        
                        all_done = all(vid.get("completed") for vid in videos)
                        p["completed"] = all_done
                        updated = True
                        break
            if updated:
                break
                
        if updated:
            total_videos = 0
            completed_videos = 0
            for p in playlists_list:
                vids = p.get("videos", [])
                total_videos += len(vids)
                completed_videos += len([v for v in vids if v.get("completed")])
            
            pct = round((completed_videos / total_videos) * 100.0, 2) if total_videos > 0 else 0.0
            
            sb.table("learning_progress").upsert({
                "session_id": g.user_id,
                "skill_name": "saved_playlists",
                "completed_steps": playlists_list,
                "completion_pct": pct
            }, on_conflict="session_id, skill_name").execute()
            
        return jsonify({
            "status": "success",
            "completed": video_completed,
            "completedAt": completed_at,
            "lastPosition": last_position,
            "watchedSeconds": watched_seconds
        })
    except Exception as e:
        print(f"[WATCH] Progress sync failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/mark-video-complete", methods=["POST"])
@token_required
def mark_video_complete():
    body = request.get_json(silent=True) or {}
    playlist_url = body.get("playlistUrl") or body.get("playlist_url") or ""
    video_id = str(body.get("videoId") or body.get("video_id") or "").strip()
    
    if not playlist_url or not video_id:
        return jsonify({"error": "playlistUrl and videoId required"}), 400
        
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "saved_playlists")\
                .limit(1)\
                .execute()
        
        playlists_list = res.data[0].get("completed_steps", []) if res.data else []
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        
        for p in playlists_list:
            if p.get("url") == playlist_url:
                videos = p.get("videos", [])
                for i, v in enumerate(videos):
                    videos[i] = _migrate_video_item(v)
                    v_item = videos[i]
                    target_vid = str(v_item.get("videoId") or v_item.get("id") or "").strip()
                    if target_vid == video_id or str(v_item.get("id")) == video_id:
                        v_item["completed"] = True
                        v_item["completedAt"] = now_iso
                        break
                p["completed"] = all(vid.get("completed") for vid in videos)
                break
                
        total_videos = 0
        completed_videos = 0
        for p in playlists_list:
            vids = p.get("videos", [])
            total_videos += len(vids)
            completed_videos += len([v for v in vids if v.get("completed")])
        
        pct = round((completed_videos / total_videos) * 100.0, 2) if total_videos > 0 else 0.0
        
        sb.table("learning_progress").upsert({
            "session_id": g.user_id,
            "skill_name": "saved_playlists",
            "completed_steps": playlists_list,
            "completion_pct": pct
        }, on_conflict="session_id, skill_name").execute()
        
        return jsonify({"status": "success", "completed": True, "completedAt": now_iso})
    except Exception as e:
        print(f"[WATCH] Mark complete failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/resume-progress/<path:video_id>", methods=["GET"])
@token_required
def resume_progress(video_id):
    playlist_url = request.args.get("playlistUrl") or request.args.get("playlist_url") or ""
    sb = get_sb()
    if not sb:
        return jsonify({"lastPosition": 0, "watchedSeconds": 0, "completed": False})
        
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "saved_playlists")\
                .limit(1)\
                .execute()
        
        playlists_list = res.data[0].get("completed_steps", []) if res.data else []
        for p in playlists_list:
            if not playlist_url or p.get("url") == playlist_url:
                for v in p.get("videos", []):
                    v_item = _migrate_video_item(v)
                    target_vid = str(v_item.get("videoId") or v_item.get("id") or "").strip()
                    if target_vid == video_id or str(v_item.get("id")) == video_id:
                        return jsonify({
                            "videoId": target_vid,
                            "lastPosition": v_item.get("lastPosition", 0),
                            "watchedSeconds": v_item.get("watchedSeconds", 0),
                            "watchTime": v_item.get("watchTime", 0),
                            "duration": v_item.get("duration", 0),
                            "completed": v_item.get("completed", False),
                            "completedAt": v_item.get("completedAt")
                        })
        return jsonify({"lastPosition": 0, "watchedSeconds": 0, "completed": False})
    except Exception as e:
        print(f"[WATCH] Get resume progress failed: {e}")
        return jsonify({"lastPosition": 0, "watchedSeconds": 0, "completed": False})

@app.route("/sync-active-roadmap", methods=["POST"])
@token_required
def sync_active_roadmap():
    pass
    body = request.get_json(silent=True) or {}
    
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        if not body:
            # Untrack roadmap by deleting active_roadmap row
            sb.table("learning_progress").delete().eq("session_id", g.user_id).eq("skill_name", "active_roadmap").execute()
            return jsonify({"status": "success"})

        skill = body.get("skill")
        level = body.get("level")
        steps = body.get("steps", [])
        pct = float(body.get("completion_pct", 0.0))
        
        roadmap_data = {
            "skill": skill,
            "level": level,
            "steps": steps
        }
        
        sb.table("learning_progress").upsert({
            "session_id": g.user_id,
            "skill_name": "active_roadmap",
            "completed_steps": roadmap_data,
            "completion_pct": pct
        }, on_conflict="session_id, skill_name").execute()
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[ROADMAP] Sync failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/get-active-roadmap", methods=["GET"])
@token_required
def get_active_roadmap():
    pass
    sb = get_sb()
    if not sb:
        return jsonify(None)
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps, completion_pct")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "active_roadmap")\
                .limit(1)\
                .execute()
        if res.data:
            row = res.data[0]
            data = row.get("completed_steps") or {}
            data["completion_pct"] = float(row.get("completion_pct", 0.0))
            return jsonify(data)
        return jsonify(None)
    except Exception as e:
        print(f"[ROADMAP] Get failed: {e}")
        return jsonify(None)

@app.route("/add-milestone", methods=["POST"])
@token_required
def add_milestone():
    pass
    body = request.get_json(silent=True) or {}
    skill_name = body.get("skill_name")
    outcome_type = body.get("outcome_type", "roadmap_complete")
    outcome_detail = body.get("outcome_detail")
    
    if not skill_name:
        return jsonify({"error": "skill_name is required"}), 400
        
    sb = get_sb()
    if not sb:
        return jsonify({"error": "DB unavailable"}), 500
        
    try:
        # Check if duplicate milestone already exists
        res = sb.table("success_metrics")\
                .select("id")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", skill_name)\
                .eq("outcome_type", outcome_type)\
                .limit(1)\
                .execute()
                
        if res.data:
            return jsonify({"status": "already_exists"})
            
        # Insert new milestone
        sb.table("success_metrics").insert({
            "session_id": g.user_id,
            "skill_name": skill_name,
            "outcome_type": outcome_type,
            "outcome_detail": outcome_detail
        }).execute()
        
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"[MILESTONES] Add failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/get-milestones", methods=["GET"])
@token_required
def get_milestones():
    pass
    sb = get_sb()
    if not sb:
        return jsonify([])
    try:
        res = sb.table("success_metrics")\
                .select("*")\
                .eq("session_id", g.user_id)\
                .order("created_at", desc=True)\
                .execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[MILESTONES] Get failed: {e}")
        return jsonify([])

@app.route("/generate-competency-audit", methods=["POST"])
@token_required
def generate_competency_audit():
    pass
    
    sb = get_sb()
    if not sb:
        return jsonify({"error": "Database connection not active"}), 500
        
    try:
        user_id = g.user_id
        
        # 1. Fetch DSA progress
        dsa_data = {"total_solved": 0, "easy_solved": 0, "medium_solved": 0, "hard_solved": 0, "weak_topics": []}
        try:
            dsa_res = sb.table("dsa_progress").select("*").eq("user_id", user_id).limit(1).execute()
            if dsa_res.data:
                dsa_data = dsa_res.data[0]
        except Exception as ex:
            print(f"[AUDIT] DSA lookup fail: {ex}")
            
        # 2. Fetch Latest Resume Analysis
        resume_data = {}
        try:
            resume_res = sb.table("resume_analysis").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
            if resume_res.data:
                resume_data = resume_res.data[0]
        except Exception as ex:
            print(f"[AUDIT] Resume lookup fail: {ex}")
            
        # 3. Fetch Learning Progress (playlists, roadmap, custom projects)
        playlists_pct = 0.0
        playlists_count = 0
        try:
            playlists_res = sb.table("learning_progress").select("*").eq("session_id", user_id).eq("skill_name", "saved_playlists").limit(1).execute()
            if playlists_res.data:
                playlists_count = len(playlists_res.data[0].get("completed_steps", []))
                playlists_pct = float(playlists_res.data[0].get("completion_pct", 0.0))
        except Exception as ex:
            print(f"[AUDIT] Playlists lookup fail: {ex}")
            
        roadmap_name = "None"
        roadmap_pct = 0.0
        try:
            roadmap_res = sb.table("learning_progress").select("*").eq("session_id", user_id).eq("skill_name", "active_roadmap").limit(1).execute()
            if roadmap_res.data:
                roadmap_name = (roadmap_res.data[0].get("completed_steps") or {}).get("skill", "None")
                roadmap_pct = float(roadmap_res.data[0].get("completion_pct", 0.0))
        except Exception as ex:
            print(f"[AUDIT] Roadmap lookup fail: {ex}")
            
        projects_count = 0
        try:
            projects_res = sb.table("learning_progress").select("*").eq("session_id", user_id).eq("skill_name", "user_projects").limit(1).execute()
            if projects_res.data:
                projects_count = len(projects_res.data[0].get("completed_steps", []))
        except Exception as ex:
            print(f"[AUDIT] Projects lookup fail: {ex}")
            
        # 4. Fetch Milestones
        milestones = []
        try:
            milestones_res = sb.table("success_metrics").select("*").eq("session_id", user_id).execute()
            milestones = [m.get("outcome_detail") for m in (milestones_res.data or [])]
        except Exception as ex:
            print(f"[AUDIT] Milestones lookup fail: {ex}")
        
        # Prepare context for Groq
        profile_context = {
            "dsa": {
                "solved": dsa_data.get("total_solved", 0),
                "easy": dsa_data.get("easy_solved", 0),
                "medium": dsa_data.get("medium_solved", 0),
                "hard": dsa_data.get("hard_solved", 0),
                "weak_topics": dsa_data.get("weak_topics") or []
            },
            "resume": {
                "ats_score": resume_data.get("ats_score", 0),
                "role": resume_data.get("ai_feedback", {}).get("role", "Software Engineer") if isinstance(resume_data.get("ai_feedback"), dict) else "Software Engineer"
            },
            "learning": {
                "playlists_saved": playlists_count,
                "playlists_overall_completion_pct": playlists_pct,
                "active_roadmap": roadmap_name,
                "roadmap_completion_pct": roadmap_pct,
                "custom_projects_logged": projects_count
            },
            "milestones": milestones
        }

        # Prompt Groq to generate a professional career competency audit
        prompt = f"""
You are a top-tier SaaS Career Intelligence & Technical Assessment engine.
Analyze the following developer prep profile data and produce a structured, high-value competency audit.

DEVELOPER PREP PROFILE DATA:
{json.dumps(profile_context, indent=2)}

You are auditing this candidate against elite global tech standards (e.g., FAANG, tier-1 tech startups, high-end unicorns).
Evaluate them critically based on their DSA portfolio, learning playlist history, custom projects count, and resume ATS score.

OUTPUT STRICTLY A VALID JSON OBJECT WITH THIS STRUCTURE:
{{
  "market_ready_level": "Junior (L3) / Mid-level (L4) / Senior (L5) / Intern",
  "readiness_verdict": "A blunt, professional 2-sentence summary of where they currently stand and their likelihood of passing top-tier interviews.",
  "scores": {{
    "dsa_standing": number (1-100, calculate logically: Easy=1pt, Med=4pt, Hard=10pt, target 500 pts total),
    "learning_depth": number (1-100, based on playlist completion and roadmap progress),
    "project_portfolio": number (1-100, based on custom projects logged and roadmap milestones),
    "ats_readiness": number (1-100, based directly on resume ATS score, default to 30 if no resume)
  }},
  "technical_gaps": [
    "List 3-4 specific technical or practical focus areas they need to fix based on their weak topics and missing items."
  ],
  "action_items": [
    "List 3-4 concrete, highly actionable next steps (e.g., 'Solve 15 more medium recursion problems', 'Upload a tailored resume to improve ATS score')."
  ],
  "estimated_weeks_to_target": number,
  "competency_breakdown": [
    {{ "skill": "Data Structures & Alg.", "candidate_score": number, "benchmark_score": 85 }},
    {{ "skill": "System Design", "candidate_score": number, "benchmark_score": 75 }},
    {{ "skill": "Project Engineering", "candidate_score": number, "benchmark_score": 80 }},
    {{ "skill": "Market Alignment (Resume)", "candidate_score": number, "benchmark_score": 85 }}
  ]
}}

STRICT RULES:
- Do NOT output any markdown, HTML, code fences, or explanations. Respond with the raw JSON object ONLY.
- Candidate scores must be integers between 5 and 100.
- If they have 0 solved questions, 0 custom projects, and 0 resume score, their competency scores must be very low. Be realistic, not overly encouraging.
- The estimated weeks to target should be a realistic integer based on how far behind they are (e.g. if DSA score is low, they need 12-24 weeks).
"""
        
        client = Groq()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional SaaS tech career audit engine. Return JSON only. Be highly precise and critical."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        audit_res = json.loads(completion.choices[0].message.content.strip())
        
        # Save competency audit to Supabase
        try:
            sb.table("learning_progress").upsert({
                "session_id": user_id,
                "skill_name": "competency_audit",
                "completed_steps": audit_res,
                "completion_pct": float(audit_res.get("scores", {}).get("dsa_standing", 0))
            }, on_conflict="session_id, skill_name").execute()
        except Exception as sb_err:
            print(f"[AUDIT] Save to Supabase failed: {sb_err}")

        return jsonify(audit_res)
        
    except Exception as e:
        print(f"[AUDIT] Generation failed: {e}")
        return jsonify({"error": "Failed to generate competency audit. Ensure you are logged in and database connection is active."}), 500

@app.route("/get-competency-audit", methods=["GET"])
@token_required
def get_competency_audit():
    pass
    sb = get_sb()
    if not sb:
        return jsonify(None)
    try:
        res = sb.table("learning_progress")\
                .select("completed_steps")\
                .eq("session_id", g.user_id)\
                .eq("skill_name", "competency_audit")\
                .limit(1)\
                .execute()
        if res.data:
            return jsonify(res.data[0].get("completed_steps"))
        return jsonify(None)
    except Exception as e:
        print(f"[AUDIT] Get failed: {e}")
        return jsonify(None)

# ──────────────────────────────────────────────
# Mock Interview System Endpoints
# ──────────────────────────────────────────────

@app.route("/generate-mock-interview", methods=["POST"])
@token_required
def generate_mock_interview():
    pass
    
    body = request.get_json(silent=True) or {}
    role = (body.get("role") or "Software Engineer").strip()
    interview_type = (body.get("interview_type") or "Coding & DSA").strip()
    benchmark = (body.get("benchmark") or "Average Company").strip()
    
    session_id = str(uuid.uuid4())
    
    prompt = f"""
You are a senior tech interviewer from a {benchmark} company.
Your task is to generate the first, challenging mock interview question for a candidate interviewing for a {role} position.
The round type is: {interview_type}.

STRICT RULES:
1. Present a realistic, challenging, and clear scenario/problem suitable for {benchmark} standard.
2. Do not solve the problem or provide sample solutions.
3. Welcome the candidate briefly, state the scenario, and ask them to respond.
4. Respond ONLY with a valid JSON object. No markdown formatting, no backticks.
5. The JSON structure MUST be exactly:
{{
  "question": "The question text here",
  "interviewer_name": "A fictional interviewer name"
}}
"""
    try:
        client = Groq()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional tech interviewer. You respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result_text = completion.choices[0].message.content.strip()
        result_data = json.loads(result_text)
        result_data["session_id"] = session_id
        return jsonify(result_data)
        
    except Exception as e:
        print(f"[INTERVIEW] Generation failed: {e}")
        return jsonify({"error": "Failed to generate mock interview question. Please try again."}), 500


@app.route("/respond-mock-interview", methods=["POST"])
@token_required
def respond_mock_interview():
    pass
    
    body = request.get_json(silent=True) or {}
    role = (body.get("role") or "Software Engineer").strip()
    interview_type = (body.get("interview_type") or "Coding & DSA").strip()
    benchmark = (body.get("benchmark") or "Average Company").strip()
    chat_history = body.get("chat_history") or []
    user_response = (body.get("user_response") or "").strip()
    
    if not user_response:
        return jsonify({"error": "Response cannot be empty"}), 400
        
    # Count how many candidate responses we have in history
    candidate_responses_count = sum(1 for msg in chat_history if msg.get("sender") == "candidate")
    
    # 3 candidate answers limit
    if candidate_responses_count >= 2:
        return jsonify({
            "is_completed": True,
            "question": "Thank you. That completes all our interview questions. Please click 'Submit for Evaluation' to generate your detailed SaaS report!"
        })
        
    # Format the transcript for the LLM
    formatted_transcript = ""
    for msg in chat_history:
        sender = "Interviewer" if msg.get("sender") == "interviewer" else "Candidate"
        formatted_transcript += f"{sender}: {msg.get('text')}\n"
    formatted_transcript += f"Candidate: {user_response}\n"
    
    prompt = f"""
You are a senior tech interviewer from a {benchmark} company.
You are conducting a {interview_type} mock interview for a {role} position.
Here is the transcript of the interview so far:
{formatted_transcript}

Ask a relevant follow-up question based on the candidate's last response: "{user_response}"
- If it is Coding & DSA: ask about edge cases, complexity (time/space), optimization, or dry-running.
- If it is System Design: ask about bottlenecks, data consistency, scaling, or failure recovery.
- If it is Behavioral: probe deeper into their action/results, conflict resolution, or learnings (following the STAR method).

Keep your follow-up concise, direct, and professional. Do not evaluate their response yet.
Respond ONLY with a valid JSON object. No markdown formatting, no backticks.
The JSON structure MUST be exactly:
{{
  "question": "Your follow-up question here"
}}
"""
    try:
        client = Groq()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional tech interviewer. You respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result_text = completion.choices[0].message.content.strip()
        result_data = json.loads(result_text)
        result_data["is_completed"] = False
        return jsonify(result_data)
        
    except Exception as e:
        print(f"[INTERVIEW] Follow-up failed: {e}")
        return jsonify({"error": "Failed to generate follow-up question. Please try again."}), 500


@app.route("/evaluate-mock-interview", methods=["POST"])
@token_required
def evaluate_mock_interview():
    pass
    
    body = request.get_json(silent=True) or {}
    role = (body.get("role") or "Software Engineer").strip()
    interview_type = (body.get("interview_type") or "Coding & DSA").strip()
    benchmark = (body.get("benchmark") or "Average Company").strip()
    chat_history = body.get("chat_history") or []
    
    # Format the transcript
    formatted_transcript = ""
    for msg in chat_history:
        sender = "Interviewer" if msg.get("sender") == "interviewer" else "Candidate"
        formatted_transcript += f"{sender}: {msg.get('text')}\n"
        
    prompt = f"""
You are an expert tech hiring manager and recruiter with 15+ years of experience.
Evaluate the following mock interview transcript:
Role: {role}
Interview Type: {interview_type}
Company Benchmark: {benchmark}

Transcript:
{formatted_transcript}

Provide a brutally honest, SaaS-level detailed scorecard and evaluation report.
Be critical and benchmark against a {benchmark} standard.
Respond ONLY with a valid JSON object. No markdown formatting, no backticks.

The JSON structure MUST be exactly:
{{
  "score": number (0 to 100),
  "verdict": "Strong Hire / Hire / Borderline / No Hire",
  "recruiter_judgment": "Honest, critical evaluation of candidate's presence, speed, and communication.",
  "categories": [
    {{ "category": "Technical Accuracy", "score": number (0-100), "feedback": "reasoning" }},
    {{ "category": "Problem Solving & Logic", "score": number (0-100), "feedback": "reasoning" }},
    {{ "category": "Communication & Articulation", "score": number (0-100), "feedback": "reasoning" }}
  ],
  "strengths": ["list of 2-3 specific things they did well"],
  "weaknesses": ["list of 2-3 critical gaps/errors that would cause a rejection"],
  "action_plan": ["list of 2-3 specific topics to revise or projects to build"],
  "ideal_response": "A detailed, professional sample solution showing how an expert L5/L6 engineer would answer the initial question and address the follow-up topics."
}}
"""
    try:
        client = Groq()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional tech hiring manager. You respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        result_text = completion.choices[0].message.content.strip()
        report = json.loads(result_text)
        
        # Save to Supabase
        sb = get_sb()
        user_id = g.user_id
        if sb and user_id:
            try:
                # Weak areas as list of strings
                weaknesses = report.get("weaknesses") or []
                score = int(report.get("score") or 0)
                
                sb.table("interview_progress").insert({
                    "user_id": user_id,
                    "target_company": benchmark,
                    "mock_interview_score": score,
                    "weak_areas": weaknesses,
                    "interview_round_type": interview_type,
                    "preparation_status": json.dumps(report)
                }).execute()
                print(f"[DB] Saved mock interview to Supabase. Score={score}")
            except Exception as sb_err:
                print(f"[DB] Save mock interview failed: {sb_err}")
                
        return jsonify(report)
        
    except Exception as e:
        print(f"[INTERVIEW] Evaluation failed: {e}")
        return jsonify({"error": "Failed to evaluate mock interview. Please try again."}), 500


@app.route("/get-interview-history", methods=["GET"])
@token_required
def get_interview_history():
    pass
    
    sb = get_sb()
    if not sb:
        return jsonify([])
        
    try:
        user_id = g.user_id
        res = sb.table("interview_progress")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[INTERVIEW] Get history failed: {e}")
        return jsonify([])


# ──────────────────────────────────────────────
# Resend Transactional Email Service
# ──────────────────────────────────────────────
def send_email_via_resend(to_email: str, subject: str, html_body: str) -> dict:
    """Sends transactional email via Resend API."""
    resend_key = os.getenv("RESEND_API_KEY", "")
    if not resend_key:
        print("[RESEND] RESEND_API_KEY not configured.")
        return {"error": "RESEND_API_KEY is not configured"}
        
    try:
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": "SkillPath AI <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        print(f"[RESEND] Email status: {resp.status_code}, response: {resp.text}")
        if resp.status_code in (200, 201):
            return resp.json()
        else:
            return {"error": resp.text, "status": resp.status_code}
    except Exception as e:
        print(f"[RESEND] Send email exception: {e}")
        return {"error": str(e)}

@app.route("/send-email-report", methods=["POST"])
@token_required
def send_email_report():
    body = request.get_json(silent=True) or {}
    to_email = body.get("email") or g.user_email
    report_type = body.get("type", "Resume Analysis & Interview Audit")
    report_html = body.get("html", """
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 12px;">
            <h2 style="color: #2563eb;">🚀 SkillPath AI Career Report</h2>
            <p>Your personalized career roadmap and audit summary is ready!</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p>Visit your command center anytime: <a href="https://skillpath-sandy.vercel.app/" style="color: #2563eb; font-weight: bold;">SkillPath Dashboard</a></p>
        </div>
    """)
    
    if not to_email or "@" not in to_email:
        return jsonify({"error": "Valid recipient email address is required"}), 400
        
    subject = f"SkillPath AI — Your {report_type} Report"
    res = send_email_via_resend(to_email, subject, report_html)
    if "error" in res and res["error"]:
        return jsonify({"error": res["error"]}), 500
    return jsonify({"message": f"Successfully sent {report_type} report to {to_email}!", "email_id": res.get("id")})

@app.route("/send-welcome-email", methods=["POST"])
@token_required
def send_welcome_email():
    body = request.get_json(silent=True) or {}
    to_email = body.get("email") or g.user_email
    name = body.get("name") or "Candidate"
    
    if not to_email or "@" not in to_email:
        return jsonify({"error": "Valid recipient email address is required"}), 400
        
    subject = f"Welcome to SkillPath AI, {name}! 🎯"
    welcome_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
            <h1 style="color: #2563eb; margin-top: 0;">Welcome aboard, {name}! 🚀</h1>
            <p style="font-size: 1.05rem; line-height: 1.6; color: #475569;">
                Your AI Career Acceleration Command Center is ready. Here is what you can accomplish:
            </p>
            <ul style="line-height: 1.8; color: #334155;">
                <li>🎯 <strong>Resume Review</strong>: Get instant ATS scores & actionable improvement recommendations.</li>
                <li>🔮 <strong>AI Career Health</strong>: Track real-time readiness across Data Structures, System Design, and Dev skills.</li>
                <li>🧬 <strong>Learning Progress</strong>: Save YouTube playlists and track video completions.</li>
                <li>✴️ <strong>Mock Interviews</strong>: Simulate technical interview rounds with real-time AI evaluation.</li>
            </ul>
            <a href="https://skillpath-sandy.vercel.app/" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; margin-top: 20px;">Open Your Dashboard →</a>
        </div>
    """
    res = send_email_via_resend(to_email, subject, welcome_html)
    if "error" in res and res["error"]:
        return jsonify({"error": res["error"]}), 500
    return jsonify({"message": f"Welcome email sent to {to_email}!", "email_id": res.get("id")})


@app.route("/")
def index():
    return redirect("/login-page")

@app.route("/dashboard")
def dashboard():
    return app.send_static_file("index.html")

@app.after_request
def add_no_cache_headers(response):
    if response.content_type and "text/html" in response.content_type:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

handler = app

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    app.run(debug=True, host="0.0.0.0", port=port)

