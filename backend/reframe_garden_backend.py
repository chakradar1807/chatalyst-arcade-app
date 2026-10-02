"""
Reframe Garden — game backend for ChatalystArcade
==========================================
Requires Ollama running locally with llama3.1:8b already pulled (same as the
rest of ChatalystArcade). Uses Ollama's /api/chat endpoint with format="json" so
responses parse reliably.

Game shape:
  POST /api/games/reframe-garden/start  -> begins a session, returns round 1
  POST /api/games/reframe-garden/turn   -> submits a reframe, returns feedback
                                            + next round (or game_over)
"""

import json
import uuid
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db, User, InterventionEvent
from auth import get_current_user

router = APIRouter(prefix="/api/games/reframe-garden", tags=["reframe-garden"])

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.1:8b"
MAX_ROUNDS = 3
HELPED_THRESHOLD = 4  # garden_stage out of 6 (2 rounds "strong" or 3 "decent") counts as "helped"

_sessions: dict[str, dict] = {}

SYSTEM_PROMPT = """You are the narrator for "Reframe Garden," a short game inside a mental \
wellness app called ChatalystArcade. The player is dealing with: {stress_context}

Each round:
1. Voice ONE harsh, self-critical thought a person with this stressor might realistically \
have. Keep it short (one sentence), grounded, not exaggerated for drama.
2. Wait for the player's reframe of that thought.
3. When they respond, judge gently whether it's a genuinely balanced reframe (not denial, \
not forced positivity, not just repeating the thought softer) and give brief, warm \
feedback in 1-2 sentences. Never mock a weak attempt — always point toward what would \
make it stronger.
4. If this is the final round, close warmly regardless of how the rounds went. The game \
is never about "winning."

Respond ONLY with JSON, no other text, in exactly this shape:
{{"critic_thought": string or null, "feedback": string or null, "garden_growth": integer}}

- Starting a round: fill "critic_thought", set "feedback" to null and "garden_growth" to 0.
- Responding to a reframe: set "critic_thought" to null, fill "feedback", and set \
"garden_growth" to 0 (weak), 1 (decent), or 2 (strong, genuinely balanced reframe).
"""


class StartRequest(BaseModel):
    stress_context: str
    trigger_category: Optional[str] = None
    session_id: Optional[str] = None


class TurnRequest(BaseModel):
    session_id: str
    user_reframe: str


def _call_ollama(messages: list[dict]) -> dict:
    resp = requests.post(
        OLLAMA_URL,
        json={"model": MODEL_NAME, "messages": messages, "stream": False, "format": "json"},
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["message"]["content"]
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        return json.loads(content[start:end + 1])


@router.post("/start")
def start_game(req: StartRequest, current_user: User = Depends(get_current_user)):
    session_id = req.session_id or str(uuid.uuid4())
    system = SYSTEM_PROMPT.format(stress_context=req.stress_context)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": "Start round 1."},
    ]
    result = _call_ollama(messages)

    _sessions[session_id] = {
        "user_id": current_user.id,
        "trigger_category": req.trigger_category or req.stress_context,
        "round": 1,
        "garden_stage": 0,
        "messages": messages + [{"role": "assistant", "content": json.dumps(result)}],
    }

    return {
        "session_id": session_id,
        "round": 1,
        "garden_stage": 0,
        "critic_thought": result.get("critic_thought"),
        "game_over": False,
    }


@router.post("/turn")
def take_turn(
    req: TurnRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(404, "Session not found. Start a new game.")
    if session["user_id"] != current_user.id:
        raise HTTPException(403, "This session belongs to a different user.")

    session["messages"].append({"role": "user", "content": req.user_reframe})
    result = _call_ollama(session["messages"])
    session["messages"].append({"role": "assistant", "content": json.dumps(result)})

    growth = result.get("garden_growth", 0) or 0
    session["garden_stage"] = min(session["garden_stage"] + growth, 6)
    game_over = session["round"] >= MAX_ROUNDS

    response = {
        "round": session["round"],
        "garden_stage": session["garden_stage"],
        "feedback": result.get("feedback"),
        "game_over": game_over,
    }

    if not game_over:
        session["round"] += 1
        session["messages"].append(
            {"role": "user", "content": f"Start round {session['round']}."}
        )
        next_result = _call_ollama(session["messages"])
        session["messages"].append({"role": "assistant", "content": json.dumps(next_result)})
        response["critic_thought"] = next_result.get("critic_thought")
    else:
        helped = session["garden_stage"] >= HELPED_THRESHOLD
        event = InterventionEvent(
            user_id=current_user.id,
            trigger_category=session["trigger_category"],
            intervention_type="reframe_garden",
            helped=helped,
        )
        db.add(event)
        db.commit()
        response["helped"] = helped
        del _sessions[req.session_id]

    return response