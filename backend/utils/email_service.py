"""
SkillPath Email Service Utility
Handles transactional email delivery using the official Resend Python SDK.
"""

import os
import logging
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import resend

# Load environment variables
load_dotenv()

# Configure module logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def send_welcome_email(email: str, name: str) -> Dict[str, Any]:
    """
    Sends a production-ready, beautifully designed Welcome Email using the Resend Python SDK.

    Args:
        email (str): The candidate's recipient email address.
        name (str): The candidate's display name.

    Returns:
        Dict[str, Any]: Dictionary containing success status, message, or email ID.
    """
    load_dotenv()
    if not email or "@" not in email:
        logger.error(f"[EMAIL_SERVICE] Invalid email address provided: {email}")
        return {"success": False, "error": "Invalid recipient email address"}

    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        logger.error("[EMAIL_SERVICE] Cannot send email: RESEND_API_KEY is missing")
        return {"success": False, "error": "RESEND_API_KEY is missing"}

    resend.api_key = api_key
    display_name = name.strip() if name else "Candidate"
    sender_email = "SkillPath AI <onboarding@resend.dev>"
    subject = "Welcome to SkillPath 🚀"

    # HTML Email Template
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to SkillPath</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #0f172a;
                color: #f8fafc;
                margin: 0;
                padding: 40px 20px;
            }}
            .email-container {{
                max-width: 580px;
                margin: 0 auto;
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 16px;
                padding: 36px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            }}
            .brand-header {{
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 28px;
            }}
            .brand-logo {{
                font-size: 1.5rem;
                font-weight: 800;
                color: #3b82f6;
                letter-spacing: -0.5px;
            }}
            .heading {{
                font-size: 1.6rem;
                font-weight: 700;
                color: #ffffff;
                margin-top: 0;
                margin-bottom: 16px;
            }}
            .subtitle {{
                font-size: 1.05rem;
                color: #94a3b8;
                line-height: 1.6;
                margin-bottom: 24px;
            }}
            .checklist-box {{
                background-color: #0f172a;
                border: 1px solid #334155;
                border-radius: 12px;
                padding: 20px 24px;
                margin-bottom: 28px;
            }}
            .checklist-title {{
                font-size: 0.95rem;
                font-weight: 700;
                color: #e2e8f0;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 14px;
            }}
            .checklist-item {{
                font-size: 0.98rem;
                color: #cbd5e1;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
            }}
            .checklist-item:last-child {{
                margin-bottom: 0;
            }}
            .cta-button {{
                display: inline-block;
                width: 100%;
                text-align: center;
                background-color: #2563eb;
                color: #ffffff !important;
                font-weight: 700;
                font-size: 1.05rem;
                text-decoration: none;
                padding: 14px 0;
                border-radius: 10px;
                transition: background-color 0.2s ease;
                box-sizing: border-box;
            }}
            .footer {{
                margin-top: 32px;
                padding-top: 20px;
                border-top: 1px solid #334155;
                font-size: 0.9rem;
                color: #64748b;
                text-align: left;
            }}
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="brand-header">
                <span class="brand-logo">&lt;/&gt; SkillPath</span>
            </div>

            <h1 class="heading">Hello {display_name} 👋</h1>
            <p class="subtitle">Welcome to SkillPath. Your AI Career Operating System is ready.</p>

            <div class="checklist-box">
                <div class="checklist-title">Complete these steps:</div>
                <div class="checklist-item">✅ Upload your Resume</div>
                <div class="checklist-item">✅ Start your Learning Roadmap</div>
                <div class="checklist-item">✅ Solve your first DSA Question</div>
                <div class="checklist-item">✅ Chat with AI Mentor</div>
            </div>

            <a href="https://skillpath-sandy.vercel.app/" class="cta-button" target="_blank">Open SkillPath</a>

            <div class="footer">
                — Team SkillPath
            </div>
        </div>
    </body>
    </html>
    """

    try:
        logger.info(f"[EMAIL_SERVICE] Dispatching welcome email via Resend SDK to {email}...")
        params: resend.Emails.SendParams = {
            "from": sender_email,
            "to": [email],
            "subject": subject,
            "html": html_content,
        }

        response = resend.Emails.send(params)
        logger.info(f"[EMAIL_SERVICE] Welcome email sent successfully to {email}. Resend ID: {response.get('id')}")
        return {
            "success": True,
            "id": response.get("id"),
            "message": f"Welcome email sent to {email}"
        }

    except Exception as exc:
        logger.error(f"[EMAIL_SERVICE] Exception occurred while sending welcome email to {email}: {exc}", exc_info=True)
        return {
            "success": False,
            "error": str(exc)
        }
