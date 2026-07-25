# 🛰️ SkillPath — Enterprise AI Career Accelerator

SkillPath is a high-performance, SaaS-style career readiness platform designed to accelerate candidate readiness for FAANG and top-tier technology companies. By orchestrating multi-agent LLM systems, local curated learning pathways, and cloud-scale database operations, SkillPath offers hyper-personalized roadmap extraction, video learning progress tracking with automatic completion, resume assessment, algorithmic practice metrics, mock interview targeting, and automated transactional email reporting.

---

<p align="center">
  <a href="https://www.python.org/">
    <img src="https://img.shields.io/badge/Python-3.9+-blue.svg?style=flat-square&logo=python" alt="Python Version" />
  </a>
  <a href="https://flask.palletsprojects.com/">
    <img src="https://img.shields.io/badge/Flask-3.0.x-lightgrey.svg?style=flat-square&logo=flask" alt="Flask Core" />
  </a>
  <a href="https://supabase.com/">
    <img src="https://img.shields.io/badge/Supabase-Database%20%26%20Auth-emerald.svg?style=flat-square&logo=supabase" alt="Supabase Integration" />
  </a>
  <a href="https://groq.com/">
    <img src="https://img.shields.io/badge/AI%20Engine-Groq%20%2F%20Llama%203.3-orange.svg?style=flat-square" alt="Groq Llama 3.3 Engine" />
  </a>
  <a href="https://resend.com/">
    <img src="https://img.shields.io/badge/Email-Resend%20API-black.svg?style=flat-square" alt="Resend Integration" />
  </a>
  <a href="https://vercel.com/">
    <img src="https://img.shields.io/badge/Deployment-Vercel-black.svg?style=flat-square&logo=vercel" alt="Vercel Deployment" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" />
  </a>
</p>

---

## 🌐 Live Production & Local Links

- **Live Production App (Vercel)**: [https://skillpath-sandy.vercel.app/dashboard](https://skillpath-sandy.vercel.app/dashboard)
- **Local Application Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Local Login Page**: [http://localhost:3000/login](http://localhost:3000/login)

---

## 🏗️ System Architecture

SkillPath is built on a decoupled client-server architecture backed by a scalable SQL persistence layer, high-throughput AI inference engine, and asynchronous email notification pipelines.

```mermaid
graph TD
    Client[Frontend SPA: HTML5/CSS3/JS] <-->|HTTP API / JWT Auth| Server[Flask API Gateway & Orchestrator]
    Server <-->|SQL Queries / Auth JWT| DB[(Supabase PostgreSQL)]
    Server <-->|PDF / DOCX Uploads| Bucket[(Supabase Storage)]
    Server <-->|Sub-100ms Inference| Groq[Groq AI: Llama-3.3 70B]
    Server <-->|Search Queries| YT[YouTube Data API v3]
    Server -->|Transactional Emails| Resend[Resend Email API]
    Server <-->|Thread-Safe Storage| Cache[In-Memory TTL Cache]
```

1. **SPA Frontend**: Single-page application UI with a glassmorphic dashboard (Nebula Design System), using Chart.js for radar charts and progress history.
2. **Flask API Gateway**: Handles REST requests, JWT authentication middleware, in-memory TTL caching, and background task execution via `ThreadPoolExecutor`.
3. **Supabase Cloud**: Manages user authentication, profile data, saved video playlists, DSA progress tracking, roadmap completion, resume evaluations, and Row-Level Security (RLS).
4. **Groq AI Engine**: Evaluates resume transcripts, grades ATS keyword density, constructs personalized skill roadmaps, and conducts mock interviews using `llama-3.3-70b-versatile`.
5. **Resend Email Service**: Sends automated welcome emails and personalized career report PDF/HTML summaries to candidates.

---

## 🌟 Core Pillars & Feature Highlights

### 1. Saved Playlists & Interactive Video Player with Automatic 75% Completion Tick `✓`
- **Embedded YouTube Player**: High-definition embedded player with instant video switching from the Course Content queue.
- **100% Automatic 75% Watch Completion**: Runs a continuous background timer (`startWatchTimers` + YouTube `postMessage` listener). When a user completes at least **75% of a video**, the video is **automatically marked completed with a green checkmark tick `✓`**.
- **Course Queue Sidebar & Saved Progress**: Highlights current video, tracks completed videos, and calculates live course progress percentages.
- **Manual Completion Toggle**: Provides a 1-click **`✓ Mark Completed`** button for manual status updates.

### 2. Structured Skill & Career Roadmaps
- **Skill Roadmaps Top Hierarchy**: **Skill Roadmaps** (Python Mastery, Java & Spring Boot, C++, JavaScript) are displayed at the top for instant language learning, followed by **Career Roadmaps** (Full Stack, Backend, AI/ML, DevOps) below.
- **Multi-Tier AI Recommendation Engine**: Uses Llama-3.3 70B via Groq to craft personalized 5-tier roadmaps: *Primary, Fast Track, Interview, Project, and Advanced*.

### 3. Multi-Stage Resume Evaluator
- **Parsing Suite**: Extracts formatted text from PDF (`pypdf`) and DOCX (`docx2txt`) uploads.
- **Recruiter Sandbox Simulation**:
  - **ATS Scanner**: Keyword density analysis and structural parsing verification.
  - **Recruiter 6-Second Review**: Rapid highlight and impact audit.
  - **Hiring Manager Audit**: Technical depth and project complexity grading.
- **Actionable Output**: Delivers scores out of 10, tailored project ideas, suggested tools, line-by-line bullet points rewrites, and email export capability.

### 4. DSA Command Center & Performance Analytics
- **Company-wise Question Mappings**: Frequency-sorted problem sets for 100+ tech companies (e.g. Google, Amazon, Meta, Microsoft, Apple).
- **GitHub-Style Heatmap**: Visualizes practice streak consistency and topic completion over time.
- **Personal Readiness Index (PRI)**: Weighted multi-variable readiness score:
  $$\text{PRI} = (\text{DSA\_Score} \times 0.40) + (\text{Resume\_Score} \times 0.30) + (\text{Playlist\_Progress} \times 0.15) + (\text{Projects\_Score} \times 0.15)$$
- **Competency Radar**: Automatically benchmarks candidates against target role baselines (Intern, L3, L4, L5, Senior).

### 5. Interactive AI Mock Interview & Evaluation
- **Simulated Interview Rounds**: AI-generated technical questions based on candidate target role and company.
- **Real-Time Scoring & Feedback**: Evaluates technical precision, communication style, and structural clarity.

### 6. Automated Email Reporting & Onboarding
- **Welcome Emails**: Automatic asynchronous welcome email dispatch upon candidate onboarding.
- **Career Reports**: One-click email dispatch of resume audit and interview feedback directly to candidate inbox via Resend.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Framework** | [Python 3.9+](https://www.python.org/) · [Flask 3.0+](https://flask.palletsprojects.com/) | REST API development, routing, and task orchestration. |
| **AI Inference** | [Groq SDK](https://groq.com/) (`llama-3.3-70b-versatile`) | Ultra-fast token generation for resume analysis and mock interviews. |
| **Database & Storage** | [Supabase](https://supabase.com/) (PostgreSQL 15) | Relational database, Supabase Auth, Object storage, and RLS policies. |
| **Email Service** | [Resend API](https://resend.com/) | Transactional email dispatch for onboarding and career audit reports. |
| **Deployment** | [Vercel](https://vercel.com/) | Live serverless cloud deployment and production hosting. |
| **Authentication** | Supabase Auth + JWT Bearer Tokens | Stateless JWT-based authentication middleware. |
| **Frontend UI** | HTML5 · Vanilla CSS3 · JS (ES6+) | Responsive glassmorphic dark-mode interface dashboard. |
| **Performance & Caching**| Thread-Safe In-Memory TTL Cache | High-speed response caching for API endpoints and metadata. |
| **Document Processing**| `pypdf` · `docx2txt` | Extract text content from candidate resume file uploads. |

---

## 📁 Repository Directory Structure

```text
AI-CATALYST/
├── app.py                      # Flask API Gateway, AI Orchestrator & Route Handlers
├── requirements.txt            # Python environment dependencies
├── .env                        # System Environment & Secret Configurations (git-ignored)
├── .gitignore                  # Git Ignore Rules
├── README.md                   # Project Documentation
├── vercel.json                 # Vercel Deployment Configuration
├── PRODUCT_CONTEXT.md          # Comprehensive Product Specifications & Roadmap
│
├── backend/                    # Core Backend Services & Utilities
│   ├── services/
│   │   └── welcome_service.py  # User Onboarding & Email Dispatch Service
│   └── utils/
│       └── email_service.py    # Resend API Transactional Email Utilities
│
├── static/                     # Single Page Application (SPA) Frontend
│   ├── login.html              # Glassmorphic Login & User Registration UI
│   ├── index.html              # Central Career Dashboard SPA
│   ├── css/
│   │   └── style.css           # Custom CSS Design System & Layout Tokens
│   └── js/
│       ├── app.js              # SPA Application Logic & Video Watch Progress Tracker
│       └── supabaseClient.js   # Supabase Authentication & Client Wrapper
│
├── supabase/                   # Supabase Infrastructure & Database Provisioning
│   ├── full_schema.sql         # Complete Production SQL Schema (13 Tables, Triggers, RLS)
│   ├── roadmap_progress.sql    # Local database migration history
│   └── config.toml             # Local Supabase configuration
│
└── data/                       # Curated Learning & Company Question Datasets
    ├── leetcode-companywise/   # CSV databases of company-specific DSA problems
    ├── certifications/         # Static database of tech certifications
    └── *.csv                   # YouTube playlist & course databases
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.9+** installed on your system.
- A **Supabase** project (URL and API Keys).
- A **Groq API Key** for LLM inference.
- *(Optional)* A **Resend API Key** for email dispatch features.

### 2. Clone and Setup Environment
```bash
git clone https://github.com/P-adithyagoud/AI-CATALYST.git
cd AI-CATALYST

# Initialize virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install required dependencies
pip install -r requirements.txt
```

### 3. Environment Variables Configuration
Create a `.env` file in the root directory:
```env
# Flask Configuration
SECRET_KEY=skillpath-dev-secret-key-2024
PORT=3000

# Supabase API Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Groq AI Engine API Key
GROQ_API_KEY=gsk_your_groq_api_key_here

# Resend API Key (Optional for email notifications)
RESEND_API_KEY=re_your_resend_api_key_here

# YouTube Data API Key (Optional for search fallback)
YOUTUBE_API_KEY=your_youtube_api_key_here
```

### 4. Setup Master Database Schema in Supabase
1. Log in to your [Supabase Dashboard](https://supabase.com).
2. Go to **SQL Editor** -> **New Query**.
3. Open `supabase/full_schema.sql` from this repository, copy its contents, and paste them into the SQL Editor.
4. Click **Run** to execute the script and provision all 13 database tables, triggers, indexes, and Row Level Security policies.

### 5. Run the Application Locally
```bash
python app.py
```
By default, the server will start at:
- **Local Base URL**: [http://localhost:3000](http://localhost:3000)
- **Login Page**: [http://localhost:3000/login](http://localhost:3000/login)
- **Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 🔌 API Reference

Main API endpoints provided by `app.py`:

| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/signup` | ❌ No | Register a new user profile with Supabase Auth |
| `POST` | `/login` | ❌ No | Authenticate user credentials and return JWT bearer token |
| `GET` | `/login` | ❌ No | Serves the login and signup frontend HTML page |
| `GET` | `/dashboard` | ❌ No | Serves the main application dashboard HTML page |
| `POST` | `/get-resource` | ✅ Yes | Retrieve skill path roadmaps and recommended learning resources |
| `POST` | `/mark-video-complete` | ✅ Yes | Persist 75% video completion status to database |
| `POST` | `/analyze-resume` | ✅ Yes | Parse PDF/DOCX resume file and return AI ATS evaluation |
| `GET` | `/get-companies` | ✅ Yes | Get list of available tech companies for DSA prep |
| `GET` | `/get-questions` | ✅ Yes | Fetch frequency-sorted LeetCode questions by company/topic |
| `POST` | `/generate-competency-audit` | ✅ Yes | Generate AI-driven career readiness report and audit |
| `POST` | `/send-email-report` | ✅ Yes | Send candidate resume/audit report via Resend email service |
| `POST` | `/send-welcome-email` | ✅ Yes | Trigger welcome email notification for new candidate |
| `POST` | `/sync-active-roadmap` | ✅ Yes | Save interactive roadmap checklist progress |

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

<p align="center">
  <i>Built with ❤️ for candidate success and career acceleration.</i>
</p>
