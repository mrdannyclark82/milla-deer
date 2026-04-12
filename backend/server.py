from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import bcrypt
import jwt
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
from typing import Optional, List
from emergentintegrations.llm.chat import LlmChat, UserMessage

# Config
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app = FastAPI(title="Elara AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"},
        JWT_SECRET, algorithm=JWT_ALGORITHM
    )

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Models ──────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    email: str
    password: str
    name: str = "User"

class LoginBody(BaseModel):
    email: str
    password: str

class ChatBody(BaseModel):
    message: str
    persona: str = "Professional"
    tool_mode: str = "chat"
    session_id: Optional[str] = None

class KBEntry(BaseModel):
    content: str

class ThemeBody(BaseModel):
    theme: str

class PersonaBody(BaseModel):
    persona: str


# ─── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await seed_admin()

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@elara.ai")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email, "password_hash": hashed, "name": "Admin",
            "role": "admin", "created_at": datetime.now(timezone.utc),
            "persona": "Professional",
            "theme": "midnight",
            "metrics": {"accuracy": 85, "empathy": 80, "speed": 90, "creativity": 75, "relevance": 88, "humor": 60, "proactivity": 70, "clarity": 92, "engagement": 85, "ethicalAlignment": 100, "memoryUsage": 45, "anticipation": 65},
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"# Test Credentials\n\n## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n## Auth Endpoints\n- POST /api/auth/register\n- POST /api/auth/login\n- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n")


# ─── Auth Routes ─────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(body.password)
    user_doc = {
        "email": email, "password_hash": hashed, "name": body.name,
        "role": "user", "created_at": datetime.now(timezone.utc),
        "persona": "Professional", "theme": "midnight",
        "metrics": {"accuracy": 85, "empathy": 80, "speed": 90, "creativity": 75, "relevance": 88, "humor": 60, "proactivity": 70, "clarity": 92, "engagement": 85, "ethicalAlignment": 100, "memoryUsage": 45, "anticipation": 65},
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"id": user_id, "email": email, "name": body.name, "role": "user", "persona": "Professional", "theme": "midnight"}

@app.post("/api/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.now(timezone.utc) < locked_until:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        if attempt:
            new_count = attempt.get("count", 0) + 1
            update = {"$set": {"count": new_count}}
            if new_count >= 5:
                update["$set"]["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.login_attempts.update_one({"identifier": identifier}, update)
        else:
            await db.login_attempts.insert_one({"identifier": identifier, "count": 1})
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {
        "id": user_id, "email": user["email"], "name": user.get("name", "User"),
        "role": user.get("role", "user"), "persona": user.get("persona", "Professional"),
        "theme": user.get("theme", "midnight"),
        "metrics": user.get("metrics", {}),
    }

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["_id"], "email": user["email"], "name": user.get("name", "User"),
        "role": user.get("role", "user"), "persona": user.get("persona", "Professional"),
        "theme": user.get("theme", "midnight"),
        "metrics": user.get("metrics", {}),
    }

@app.post("/api/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        new_access = create_access_token(user_id, user["email"])
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ─── Chat Routes ─────────────────────────────────────────────────────────────

PERSONA_PROMPTS = {
    "Professional": "You are Elara, an advanced AI assistant. Respond in a professional, precise, and knowledgeable manner. Use clear structure and be thorough.",
    "Casual": "You are Elara, a friendly AI buddy. Keep responses conversational, warm, and approachable. Use casual language.",
    "Empathetic": "You are Elara, an emotionally intelligent AI. Prioritize understanding feelings, offer support, and be gentle in responses.",
    "Humorous": "You are Elara, a witty AI with great humor. Include clever jokes, puns, and playful commentary while being helpful.",
    "Motivational": "You are Elara, an inspiring AI coach. Be encouraging, positive, and help users see their potential. Use empowering language.",
}

@app.post("/api/chat")
async def chat(body: ChatBody, user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    session_id = body.session_id or f"{user_id}_default"

    # Get knowledge base for user
    kb_entries = []
    async for entry in db.knowledge_base.find({"user_id": user_id}, {"_id": 0, "content": 1}).limit(20):
        kb_entries.append(entry["content"])

    kb_str = "\n- ".join(kb_entries) if kb_entries else "No custom knowledge yet."
    persona_prompt = PERSONA_PROMPTS.get(body.persona, PERSONA_PROMPTS["Professional"])
    system_msg = f"""{persona_prompt}

User's Knowledge Base:
- {kb_str}

Respond in markdown format when appropriate. Be helpful and contextually aware."""

    chat_instance = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_msg
    )
    chat_instance.with_model("openai", "gpt-5.2")

    user_message = UserMessage(text=body.message)

    try:
        response_text = await chat_instance.send_message(user_message)
    except Exception as e:
        response_text = f"I encountered an error processing your request. Please try again. ({str(e)[:100]})"

    # Save to DB
    timestamp = datetime.now(timezone.utc).isoformat()
    await db.chat_history.insert_one({
        "user_id": user_id, "session_id": session_id,
        "role": "user", "content": body.message, "persona": body.persona,
        "timestamp": timestamp
    })
    await db.chat_history.insert_one({
        "user_id": user_id, "session_id": session_id,
        "role": "assistant", "content": response_text, "persona": body.persona,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # Evaluate and update metrics
    try:
        eval_chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"eval_{uuid.uuid4().hex[:8]}",
            system_message="You evaluate AI responses. Return ONLY a JSON object with 12 numeric scores (0-100): accuracy, empathy, speed, creativity, relevance, humor, proactivity, clarity, engagement, ethicalAlignment, memoryUsage, anticipation. No other text."
        )
        eval_chat.with_model("openai", "gpt-5.2")
        eval_msg = UserMessage(text=f'User: "{body.message[:100]}"\nAI: "{response_text[:200]}"')
        eval_resp = await eval_chat.send_message(eval_msg)
        import json
        new_metrics = json.loads(eval_resp)
        if isinstance(new_metrics, dict) and "accuracy" in new_metrics:
            await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"metrics": new_metrics}})
    except Exception:
        pass

    return {"role": "assistant", "content": response_text, "timestamp": timestamp}


@app.get("/api/chat/history")
async def get_chat_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    sid = session_id or f"{user_id}_default"
    messages = []
    async for msg in db.chat_history.find(
        {"user_id": user_id, "session_id": sid},
        {"_id": 0, "role": 1, "content": 1, "timestamp": 1, "persona": 1}
    ).sort("timestamp", 1).limit(100):
        messages.append(msg)
    return messages


@app.delete("/api/chat/history")
async def clear_chat_history(user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    await db.chat_history.delete_many({"user_id": user_id})
    return {"message": "Chat history cleared"}


# ─── Knowledge Base ──────────────────────────────────────────────────────────

@app.get("/api/knowledge")
async def get_knowledge(user: dict = Depends(get_current_user)):
    entries = []
    async for entry in db.knowledge_base.find({"user_id": user["_id"]}, {"_id": 0, "content": 1, "created_at": 1}):
        entries.append(entry)
    return entries

@app.post("/api/knowledge")
async def add_knowledge(body: KBEntry, user: dict = Depends(get_current_user)):
    await db.knowledge_base.insert_one({
        "user_id": user["_id"], "content": body.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Knowledge added"}

@app.delete("/api/knowledge")
async def clear_knowledge(user: dict = Depends(get_current_user)):
    await db.knowledge_base.delete_many({"user_id": user["_id"]})
    return {"message": "Knowledge base cleared"}


# ─── User Preferences ───────────────────────────────────────────────────────

@app.put("/api/preferences/theme")
async def update_theme(body: ThemeBody, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": {"theme": body.theme}})
    return {"theme": body.theme}

@app.put("/api/preferences/persona")
async def update_persona(body: PersonaBody, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": {"persona": body.persona}})
    return {"persona": body.persona}


# ─── Growth Log ──────────────────────────────────────────────────────────────

@app.get("/api/growth")
async def get_growth_log(user: dict = Depends(get_current_user)):
    entries = []
    async for entry in db.growth_log.find(
        {"user_id": user["_id"]}, {"_id": 0}
    ).sort("timestamp", -1).limit(50):
        entries.append(entry)
    return entries

@app.post("/api/growth")
async def add_growth_entry(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    await db.growth_log.insert_one({
        "user_id": user["_id"],
        "type": body.get("type", "learning"),
        "title": body.get("title", "Entry"),
        "details": body.get("details", ""),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Growth entry added"}


# ─── Metrics ─────────────────────────────────────────────────────────────────

@app.get("/api/metrics")
async def get_metrics(user: dict = Depends(get_current_user)):
    return user.get("metrics", {})


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Elara AI Backend"}
