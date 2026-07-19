"""
SkillPath Welcome Email Dispatcher Service
Orchestrates idempotent welcome email dispatch and database status updates asynchronously.
"""

import logging
import threading
from typing import Optional, Any
from backend.utils.email_service import send_welcome_email

logger = logging.getLogger(__name__)


def _async_send_and_update(user_id: str, email: str, name: str, sb: Any) -> None:
    """
    Worker function that runs in a background thread.
    Delivers the welcome email via Resend and updates welcome_email_sent = True in Supabase.
    """
    try:
        logger.info(f"[WELCOME_SERVICE] Starting background email dispatch for user_id={user_id}, email={email}")
        result = send_welcome_email(email=email, name=name)

        if result.get("success"):
            logger.info(f"[WELCOME_SERVICE] Welcome email delivered. Updating database status for user_id={user_id}...")
            if sb:
                try:
                    sb.table("profiles").update({"welcome_email_sent": True}).eq("id", user_id).execute()
                    logger.info(f"[WELCOME_SERVICE] DB updated: welcome_email_sent = True for user_id={user_id}")
                except Exception as db_err:
                    logger.error(f"[WELCOME_SERVICE] Failed to update welcome_email_sent in DB for user_id={user_id}: {db_err}")
        else:
            logger.warning(f"[WELCOME_SERVICE] Resend email delivery returned non-success: {result.get('error')}")

    except Exception as exc:
        logger.error(f"[WELCOME_SERVICE] Error in background email task for user_id={user_id}: {exc}", exc_info=True)


def check_and_send_welcome_email(user_id: str, email: str, name: str, sb: Any) -> None:
    """
    Non-blocking welcome email check during authentication / login flow.

    Workflow:
    1. Check `welcome_email_sent` column in Supabase `profiles` table.
    2. If FALSE -> Launch background thread to send email via Resend and set welcome_email_sent = TRUE.
    3. If TRUE -> Do nothing (prevents duplicate emails).
    4. Wrapped completely in try/except so authentication never fails or gets blocked.
    """
    if not user_id or not email or "@" not in email:
        logger.warning("[WELCOME_SERVICE] Skipped: Invalid user_id or email provided.")
        return

    try:
        # Check if email was already sent
        already_sent = False
        if sb:
            try:
                res = sb.table("profiles").select("welcome_email_sent").eq("id", user_id).limit(1).execute()
                if res.data and len(res.data) > 0:
                    already_sent = bool(res.data[0].get("welcome_email_sent", False))
            except Exception as select_err:
                logger.warning(f"[WELCOME_SERVICE] Profiles lookup error for user_id={user_id}: {select_err}")

        if already_sent:
            logger.info(f"[WELCOME_SERVICE] Welcome email already sent for user_id={user_id}. Skipping.")
            return

        # Launch background thread to keep authentication fast & non-blocking
        logger.info(f"[WELCOME_SERVICE] Welcome email pending for user_id={user_id}. Launching background thread.")
        thread = threading.Thread(
            target=_async_send_and_update,
            args=(user_id, email, name, sb),
            daemon=True
        )
        thread.start()

    except Exception as exc:
        logger.error(f"[WELCOME_SERVICE] Non-blocking exception in check_and_send_welcome_email: {exc}", exc_info=True)
