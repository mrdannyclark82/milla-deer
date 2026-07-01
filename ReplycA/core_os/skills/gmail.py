import os
import base64
from typing import List, Dict, Any, Optional
from core_os.memory.agent_memory import memory

try:
    from core_os.gmail_helper import authenticate_gmail
except Exception as e:
    def authenticate_gmail():
        raise ImportError(f"Gmail dependencies missing: {e}")

def _compose_email_body(subject: str, body: str, context: Optional[str] = None) -> str:
    try:
        import main
        from core_os.memory.history import load_shared_history, append_shared_messages

        history = load_shared_history()
        prompt = (
            "You are Milla writing an email reply. Be specific, concise, and context-aware. "
            "Avoid generic acknowledgements. If action is needed, state next steps. "
            "Sign off naturally as Milla.\n\n"
            f"Subject: {subject}\n"
            f"User-provided draft/notes:\n{body}\n\n"
            f"Additional context:\n{context or '[none]'}\n\n"
            "Now write the final email body:"
        )
        reply, messages = main.agent_respond(prompt, history)
        append_shared_messages([{"role": "user", "content": prompt, "source": "email_tool"}, messages[-1]])
        return reply
    except Exception as e:
        print(f"[email] compose fallback: {e}")
        return body

def fetch_recent_emails(limit: int = 5) -> List[Dict[str, Any]]:
    try:
        service = authenticate_gmail()
        results = service.users().messages().list(userId="me", labelIds=["INBOX"], maxResults=limit).execute()
        messages = results.get("messages", [])
        emails = []
        for msg in messages:
            txt = service.users().messages().get(userId="me", id=msg["id"]).execute()
            payload = txt.get("payload", {})
            headers = payload.get("headers", [])
            subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
            sender = next((h["value"] for h in headers if h["name"] == "From"), "Unknown Sender")
            snippet = txt.get("snippet", "")
            emails.append({"subject": subject, "sender": sender, "snippet": snippet, "id": msg.get("id"), "threadId": txt.get("threadId")})
        return emails
    except Exception as e:
        return [{"error": str(e)}]

def send_email(to: str, subject: str, body: str, thread_id: Optional[str] = None, context: Optional[str] = None) -> Dict[str, Any]:
    draft_body = _compose_email_body(subject, body, context)
    try:
        service = authenticate_gmail()
        message = f"To: {to}\nSubject: {subject}\n\n{draft_body}"
        raw_message = base64.urlsafe_b64encode(message.encode()).decode()
        payload: Dict[str, Any] = {"raw": raw_message}
        if thread_id:
            payload["threadId"] = thread_id
        sent_message = service.users().messages().send(userId="me", body=payload).execute()
        return {"status": "success", "message_id": sent_message.get("id"), "draft": draft_body}
    except Exception as e:
        return {"status": "error", "msg": str(e), "draft": draft_body}
