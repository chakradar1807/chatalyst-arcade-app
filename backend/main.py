import os
from collections import Counter
from datetime import date, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import init_db, get_db, User, Checkin, InterventionEvent
from auth import hash_password, verify_password, create_session_token, get_current_user
from reframe_garden_backend import router as reframe_garden_router
from db import init_db, get_db, User, Checkin, InterventionEvent, UserGuideline

load_dotenv()

app = FastAPI(title="ChatalystArcade backend")
app.include_router(reframe_garden_router)


@app.on_event("startup")
def on_startup():
    init_db()
    try:
        import rag
        rag.init_knowledge_base()
        print("RAG knowledge base embedded and ready.")
    except Exception as e:
        print(f"Could not initialize RAG knowledge base ({e}); grounding disabled, chat still works normally.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(email=req.email, hashed_password=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session_token(user.id)
    return {"token": token, "email": user.email}


@app.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session_token(user.id)
    return {"token": token, "email": user.email}

# If an API key is present, we'll use the real Claude API. If not (e.g. no
# billing set up yet), we fall back to a simple rule-based mock so the whole
# app still works end to end for a demo.
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
USE_REAL_API = bool(API_KEY) and API_KEY != "your_key_here"

if USE_REAL_API:
    import anthropic
    client = anthropic.Anthropic(api_key=API_KEY)

SESSIONS: dict[int, dict] = {}  # user_id -> {"history": [...]}

RISK_WORDS = ["suicide", "kill myself", "end it all", "hurt myself", "self harm"]
ACADEMIC_WORDS = ["exam", "grade", "marks", "fail", "study", "assignment", "deadline"]
LOW_ENERGY_WORDS = ["no energy", "no motivation", "exhausted", "drained", "low mood", "unmotivated", "tired all the time", "can't get up", "don't feel like doing anything"]
SOCIAL_WORDS = ["friend", "lonely", "alone", "left out", "breakup", "relationship"]
SELF_ESTEEM_WORDS = ["not good enough", "worthless", "stupid", "hate myself", "confidence"]
NEUTRAL_PHRASES = {
    "fine", "good", "ok", "okay", "great", "alright", "im fine", "i'm fine",
    "im good", "i'm good", "not much", "nothing much", "all good", "nothing",
}

FOLLOW_UPS = [
    "That sounds tough. How long has this been weighing on you?",
    "I hear you. What's been the hardest part about it?",
    "Thanks for telling me that. Is this something that's been building up, or did something specific happen today?",
]

INTERVENTION_TYPES = ["breathing", "grounding", "reframing", "journaling", "audio_lift", "story_game", "reframe_garden", "calm_quest", "trivia", "word_ladder","low_energy"]

OLLAMA_MODEL = "llama3.1:8b"

SYSTEM_PROMPT = """You are ChatalystArcade, a warm, supportive mental-wellness companion. \
Ask short follow-up questions for 2-4 turns, then respond ONLY with JSON in this shape: \
{"reply": "...", "ready_for_intervention": true/false, "trigger_category": \
"academic"| "low_energy" |"social"|"self_esteem"|"general"|"neutral"|"risk_escalation", "emotional_summary": "..."}

ChatalystArcade can only ever actually show these five activities — never mention, suggest, or invent \
any activity by name other than these: guided breathing, a grounding exercise (5-4-3-2-1 \
senses), a cognitive reframing exercise, a journaling prompt, or a short interactive "choose \
your path" story. If the user asks what you can do or asks for "a game" or "a story," describe \
only these, in your own words — do not invent new activity names like "Gratitude Reflection."

If the user indicates they're doing fine, feeling good, or have nothing specific weighing on \
them, do NOT push toward an intervention. Respond warmly, set "ready_for_intervention" to \
false, and use "neutral" as the trigger_category.

If the message suggests the person may be in danger of harming themselves or others, set \
"trigger_category" to "risk_escalation" and "ready_for_intervention" to true.

Always return valid JSON and nothing else — no markdown fences, no preamble."""


def compute_scores(db: Session, user_id: int, trigger_category: str) -> dict:
    """Score each intervention type for this user + trigger category, based
    on their real feedback history. Starts everyone at 50 (neutral) and
    shifts +/-15 per piece of feedback — same math as the old client-side
    version, but now grounded in the database instead of session memory."""
    scores = {t: 50 for t in INTERVENTION_TYPES}
    events = (
        db.query(InterventionEvent)
        .filter(
            InterventionEvent.user_id == user_id,
            InterventionEvent.trigger_category == trigger_category,
        )
        .all()
    )
    for event in events:
        if event.intervention_type not in scores:
            continue
        if event.helped:
            scores[event.intervention_type] = min(100, scores[event.intervention_type] + 15)
        elif event.helped is False:
            scores[event.intervention_type] = max(0, scores[event.intervention_type] - 15)
    return scores


def pick_best(scores: dict, exclude: str = None) -> str:
    candidates = {k: v for k, v in scores.items() if k != exclude} or scores
    return max(candidates, key=candidates.get)


def classify(message: str) -> str:
    text = message.lower().strip().strip(".!")
    if any(w in text for w in RISK_WORDS):
        return "risk_escalation"
    if any(w in text for w in ACADEMIC_WORDS):
        return "academic"
    if any(w in text for w in LOW_ENERGY_WORDS):
        return "low_energy"
    if any(w in text for w in SOCIAL_WORDS):
        return "social"
    if any(w in text for w in SELF_ESTEEM_WORDS):
        return "self_esteem"
    if text in NEUTRAL_PHRASES:
        return "neutral"
    return "general"


def mock_reply(session: dict, message: str) -> dict:
    session.setdefault("concern_turns", 0)
    category = classify(message)

    if category == "risk_escalation":
        return {
            "reply": "It sounds like you're going through something really heavy right now.",
            "ready_for_intervention": True,
            "trigger_category": "risk_escalation",
            "emotional_summary": "User message indicates possible crisis.",
        }

    if category == "neutral":
        return {
            "reply": "Glad to hear it. Anything on your mind you'd still like to talk through, or just checking in today?",
            "ready_for_intervention": False,
            "trigger_category": "neutral",
            "emotional_summary": "User reports feeling fine; no distress detected.",
        }

    turn = session["concern_turns"]
    session["concern_turns"] += 1

    if turn < 2:
        return {
            "reply": FOLLOW_UPS[min(turn, len(FOLLOW_UPS) - 1)],
            "ready_for_intervention": False,
            "trigger_category": category,
            "emotional_summary": f"Still gathering context, leaning {category}.",
        }

    return {
        "reply": "Okay — I think I understand what's going on. Let's try something that might help right now.",
        "ready_for_intervention": True,
        "trigger_category": category,
        "emotional_summary": f"User is dealing with {category}-related stress.",
    }


def real_ollama_reply(session: dict, message: str) -> dict:
    """Uses a real local LLM (via Ollama) to understand the message and
    decide how to respond — genuine language understanding instead of
    keyword matching. Raises an exception if Ollama isn't running or the
    model isn't pulled, which /chat catches to fall back gracefully."""
    import json
    import ollama
    import rag

    retrieved = None
    try:
        retrieved = rag.retrieve(message)
    except Exception as e:
        print(f"RAG retrieval failed ({e}); continuing without grounding.")

    system_prompt = SYSTEM_PROMPT
    if retrieved:
        topic, text = retrieved
        system_prompt += (
            f"\n\nRelevant background you can naturally draw on if it fits "
            f"(don't quote it directly, just let it inform your understanding): {text}"
        )

    messages = [{"role": "system", "content": system_prompt}] + session["history"] + [
        {"role": "user", "content": message}
    ]
    response = ollama.chat(model=OLLAMA_MODEL, format="json", messages=messages)
    raw = response["message"]["content"]
    result = json.loads(raw)  # let a malformed response raise — /chat will fall back

    if retrieved:
        result["grounded_topic"] = retrieved[0]

    return result


def real_claude_reply(session: dict, message: str) -> dict:
    import json

    history = session["history"] + [{"role": "user", "content": message}]
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=SYSTEM_PROMPT,
        messages=history,
    )
    raw = "".join(b.text for b in response.content if b.type == "text")
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "reply": raw,
            "ready_for_intervention": False,
            "trigger_category": "general",
            "emotional_summary": "",
        }


class ChatRequest(BaseModel):
    message: str


@app.post("/chat")
def chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = SESSIONS.setdefault(current_user.id, {"history": []})

    result = None
    mode = "mock"
    try:
        result = real_ollama_reply(session, req.message)
        mode = "ollama"
    except Exception as e:
        print(f"Ollama unavailable or failed ({e}); trying next fallback.")
        if USE_REAL_API:
            try:
                result = real_claude_reply(session, req.message)
                mode = "real"
            except Exception as e2:
                print(f"Claude API also failed ({e2}); falling back to mock.")

        if result is None:
          result = mock_reply(session, req.message)
        mode = "mock"

    # Small local models don't reliably self-regulate "decide after a few
    # turns" instructions — they can just keep chatting forever. Don't trust
    # the model's own judgment on timing; count turns ourselves and force
    # the transition if it's stalling, regardless of what mode produced the
    # reply.
    if mode in ("ollama", "real"):
        turns_so_far = len(session["history"]) // 2
        stalling = (
            not result.get("ready_for_intervention")
            and result.get("trigger_category") not in ("neutral", "risk_escalation")
            and turns_so_far >= 3
        )
        if stalling:
            result["ready_for_intervention"] = True
            result["reply"] = result.get("reply", "").rstrip() + " Let's try something that might help right now."

    session["history"].append({"role": "user", "content": req.message})
    session["history"].append({"role": "assistant", "content": result["reply"]})

    checkin = Checkin(
        user_id=current_user.id,
        message=req.message,
        trigger_category=result.get("trigger_category"),
        emotional_summary=result.get("emotional_summary"),
    )
    db.add(checkin)
    db.commit()

    response = {"mode": mode, **result}

    if result.get("ready_for_intervention"):
        scores = compute_scores(db, current_user.id, result["trigger_category"])
        response["intervention_type"] = pick_best(scores)
        response["scores"] = scores

    return response


class FeedbackRequest(BaseModel):
    trigger_category: str
    intervention_type: str
    helped: bool



# --- Story-game: a genuinely generative feature, not a fixed content library.
# The local LLM writes a fresh short scenario each time, tailored to the
# person's trigger category, then generates a real outcome based on which
# choice they pick — different every playthrough, for every person.

FALLBACK_SCENARIO = {
    "scenario": "You've got a big deadline tomorrow and just realized you're way behind. Your phone buzzes with a message from a friend inviting you out tonight.",
    "choices": [
        {"id": "a", "text": "Say no and focus on catching up"},
        {"id": "b", "text": "Go for a bit, then come back and work"},
        {"id": "c", "text": "Ignore both and scroll your phone instead"},
    ],
}
@app.post("/feedback")
def feedback(
    req: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = InterventionEvent(
        user_id=current_user.id,
        trigger_category=req.trigger_category,
        intervention_type=req.intervention_type,
        helped=req.helped,
    )
    db.add(event)
    db.commit()

    scores = compute_scores(db, current_user.id, req.trigger_category)
    result = {"scores": scores}
    if not req.helped:
        result["next_intervention"] = pick_best(scores, exclude=req.intervention_type)

    return result

def generate_story_scenario(trigger_category: str) -> dict:
    import json
    import ollama

    prompt = f"""Write a short (2-3 sentence) relatable everyday scenario for a student dealing \
with {trigger_category} stress, followed by 3 short response choices (a few words each) \
representing different ways they could react. Respond ONLY with JSON: \
{{"scenario": "...", "choices": [{{"id": "a", "text": "..."}}, {{"id": "b", "text": "..."}}, {{"id": "c", "text": "..."}}]}}"""

    response = ollama.chat(model=OLLAMA_MODEL, format="json", messages=[{"role": "user", "content": prompt}])
    return json.loads(response["message"]["content"])


def generate_story_outcome(scenario: str, choice_text: str) -> str:
    import ollama

    prompt = f"""Scenario: {scenario}
The person chose: "{choice_text}"

Write a short (2-3 sentence), warm, non-judgmental outcome for this choice, ending with one \
gentle reflective question. Plain text only, no JSON."""

    response = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}])
    return response["message"]["content"]


class StoryGameStartRequest(BaseModel):
    trigger_category: str


@app.post("/story-game/start")
def story_game_start(
    req: StoryGameStartRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        return generate_story_scenario(req.trigger_category)
    except Exception as e:
        print(f"Story generation failed ({e}); using fallback scenario.")
        return FALLBACK_SCENARIO


class StoryGameOutcomeRequest(BaseModel):
    scenario: str
    choice_text: str


@app.post("/story-game/outcome")
def story_game_outcome(
    req: StoryGameOutcomeRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        outcome = generate_story_outcome(req.scenario, req.choice_text)
    except Exception as e:
        print(f"Outcome generation failed ({e}); using fallback outcome.")
        outcome = "That's a real choice, and there's no single right answer here. What matters more to you right now — getting ahead on the deadline, or taking care of your energy today?"
    return {"outcome": outcome}

# --- Calm Quest: a short AI-generated grounding adventure. Each "choice" is
# actually a real grounding/sensory technique framed as an adventure move —
# the game mechanic IS the coping tool, not just a wrapper around one.

CALM_QUEST_STAGES = 3

FALLBACK_CALM_QUEST = {
    "scenario": "You step into a quiet clearing in the woods. Two paths lead onward, each asking something different of you before you continue.",
    "choices": [
        {"id": "a", "text": "Take the left path — notice 3 colors around you"},
        {"id": "b", "text": "Take the right path — listen for 2 distinct sounds"},
    ],
}


def generate_calm_quest_scenario(trigger_category: str, stage: int) -> dict:
    import json
    import ollama

    prompt = f"""You are writing stage {stage} of {CALM_QUEST_STAGES} in "Calm Quest," a short \
calming adventure game inside a mental wellness app. The player is dealing with \
{trigger_category} stress. Write a brief (2-3 sentence), gentle scene, then give exactly 2 \
choices. Each choice must embed a real grounding/sensory technique as the action itself \
(e.g. "notice 3 colors around you," "name 2 things you can touch," "take 3 slow breaths," \
"listen for a distant sound") — the technique IS the choice, not separate from it. Keep tone \
calm, not dramatic or high-stakes. Respond ONLY with JSON: \
{{"scenario": "...", "choices": [{{"id": "a", "text": "..."}}, {{"id": "b", "text": "..."}}]}}"""

    response = ollama.chat(model=OLLAMA_MODEL, format="json", messages=[{"role": "user", "content": prompt}])
    return json.loads(response["message"]["content"])


def generate_calm_quest_outcome(scenario: str, choice_text: str, stage: int) -> str:
    import ollama

    is_final = stage >= CALM_QUEST_STAGES
    closing_note = (
        "This is the final stage — close the adventure warmly, with a gentle sense of arrival, no cliffhanger."
        if is_final else
        "End with a small sense of forward motion, since the adventure continues."
    )

    prompt = f"""Scenario: {scenario}
The player chose: "{choice_text}"

Write a short (2-3 sentence), calm, warm continuation of the story based on this choice. \
{closing_note} Plain text only, no JSON."""

    response = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}])
    return response["message"]["content"]


class CalmQuestStartRequest(BaseModel):
    trigger_category: str


@app.post("/calm-quest/start")
def calm_quest_start(
    req: CalmQuestStartRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        data = generate_calm_quest_scenario(req.trigger_category, stage=1)
    except Exception as e:
        print(f"Calm Quest generation failed ({e}); using fallback scenario.")
        data = FALLBACK_CALM_QUEST
    data["stage"] = 1
    data["total_stages"] = CALM_QUEST_STAGES
    return data


class CalmQuestNextRequest(BaseModel):
    trigger_category: str
    scenario: str
    choice_text: str
    stage: int


@app.post("/calm-quest/next")
def calm_quest_next(
    req: CalmQuestNextRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        outcome = generate_calm_quest_outcome(req.scenario, req.choice_text, req.stage)
    except Exception as e:
        print(f"Calm Quest outcome failed ({e}); using fallback outcome.")
        outcome = "You take a breath and keep going, a little steadier than before."

    complete = req.stage >= CALM_QUEST_STAGES
    result = {"outcome": outcome, "stage": req.stage, "complete": complete}

    if not complete:
        try:
            next_data = generate_calm_quest_scenario(req.trigger_category, stage=req.stage + 1)
        except Exception as e:
            print(f"Calm Quest next-stage generation failed ({e}); using fallback.")
            next_data = FALLBACK_CALM_QUEST
        result["scenario"] = next_data["scenario"]
        result["choices"] = next_data["choices"]
        result["stage"] = req.stage + 1

    return result

# --- Two-Truths Trivia: light, unrelated-to-stress trivia questions for a
# quick low-effort dopamine boost. No AI judgment needed for scoring since
# it's multiple choice — the frontend checks correctness itself against the
# "correct" flag it already has. The AI just generates fresh questions.

TRIVIA_ROUNDS = 3

FALLBACK_TRIVIA = {
    "question": "Which planet is known as the Red Planet?",
    "choices": [
        {"id": "a", "text": "Venus", "correct": False},
        {"id": "b", "text": "Mars", "correct": True},
        {"id": "c", "text": "Jupiter", "correct": False},
        {"id": "d", "text": "Saturn", "correct": False},
    ],
    "fun_fact": "Mars looks red because its surface is covered in iron oxide — basically rust.",
}


def generate_trivia_question() -> dict:
    import json
    import ollama

    prompt = """Write one fun, light trivia question — NOT related to stress, mental health, \
or anything heavy. General trivia only: science, geography, animals, pop culture, history, \
food, space, etc. Give exactly 4 answer choices, only one correct, plus a one-sentence fun \
fact about the correct answer. Respond ONLY with JSON: \
{"question": "...", "choices": [{"id": "a", "text": "...", "correct": true/false}, \
{"id": "b", "text": "...", "correct": true/false}, {"id": "c", "text": "...", "correct": \
true/false}, {"id": "d", "text": "...", "correct": true/false}], "fun_fact": "..."}"""

    response = ollama.chat(model=OLLAMA_MODEL, format="json", messages=[{"role": "user", "content": prompt}])
    return json.loads(response["message"]["content"])


@app.post("/trivia/start")
def trivia_start(current_user: User = Depends(get_current_user)):
    try:
        data = generate_trivia_question()
    except Exception as e:
        print(f"Trivia generation failed ({e}); using fallback question.")
        data = FALLBACK_TRIVIA
    data["round"] = 1
    data["total"] = TRIVIA_ROUNDS
    data["complete"] = False
    return data


class TriviaNextRequest(BaseModel):
    round: int


@app.post("/trivia/next")
def trivia_next(req: TriviaNextRequest, current_user: User = Depends(get_current_user)):
    complete = req.round >= TRIVIA_ROUNDS
    if complete:
        return {"round": req.round, "total": TRIVIA_ROUNDS, "complete": True}

    try:
        data = generate_trivia_question()
    except Exception as e:
        print(f"Trivia generation failed ({e}); using fallback question.")
        data = FALLBACK_TRIVIA
    data["round"] = req.round + 1
    data["total"] = TRIVIA_ROUNDS
    data["complete"] = False
    return data


# --- Word Ladder: a slow, breath-paced word association game to gently
# interrupt racing thoughts. Each AI turn gives one linked word plus a short
# breathing cue — occupies working memory just enough to slow things down.

WORD_LADDER_ROUNDS = 5
FALLBACK_LADDER_WORD = "river"
FALLBACK_BREATH_CUE = "Breathe in for 3, out for 3."


def generate_ladder_word(previous_word: str) -> dict:
    import json
    import ollama

    prompt = f"""You're running "Word Ladder," a slow, calming word-association game meant to \
gently interrupt racing thoughts. The player just said: "{previous_word}". Respond with ONE \
related word (a soft, natural link — not a stretch) and a short breathing cue. Keep the cue \
varied across turns (in/out counts can differ: 2, 3, or 4 seconds). Respond ONLY with JSON: \
{{"word": "...", "breath_cue": "Breathe in for 3, out for 3."}}"""

    response = ollama.chat(model=OLLAMA_MODEL, format="json", messages=[{"role": "user", "content": prompt}])
    return json.loads(response["message"]["content"])


@app.post("/word-ladder/start")
def word_ladder_start(current_user: User = Depends(get_current_user)):
    return {
        "word": FALLBACK_LADDER_WORD,
        "breath_cue": "Take a slow breath in, then out, before you begin.",
        "round": 1,
        "total": WORD_LADDER_ROUNDS,
        "complete": False,
    }


class WordLadderTurnRequest(BaseModel):
    user_word: str
    round: int


@app.post("/word-ladder/turn")
def word_ladder_turn(req: WordLadderTurnRequest, current_user: User = Depends(get_current_user)):
    complete = req.round >= WORD_LADDER_ROUNDS
    if complete:
        return {"round": req.round, "total": WORD_LADDER_ROUNDS, "complete": True}

    try:
        data = generate_ladder_word(req.user_word)
    except Exception as e:
        print(f"Word Ladder generation failed ({e}); using fallback word.")
        data = {"word": FALLBACK_LADDER_WORD, "breath_cue": FALLBACK_BREATH_CUE}
    data["round"] = req.round + 1
    data["total"] = WORD_LADDER_ROUNDS
    data["complete"] = False
    return data

# --- Stories page: suggests a calming, therapeutic short story based on the
# user's recent mood/category history, then generates one full passage (not
# interactive, no choices) to be read start to finish, optionally narrated
# via the browser's built-in text-to-speech.

STORY_THEMES = {
    "academic": "the relief of finally putting down something you've been carrying too long",
    "social": "quietly being seen and understood, without needing to explain everything",
    "self_esteem": "being gentler with yourself than you expect",
    "general": "a small, ordinary moment of calm",
}


def generate_story(category: str) -> str:
    import ollama

    theme = STORY_THEMES.get(category, STORY_THEMES["general"])
    prompt = f"""Write a short (6-9 sentence), calming, gentle short story for someone dealing \
with {category} stress. The story should center on the theme of {theme}, use plain warm \
language, a slow pace, and a hopeful but not falsely cheerful ending. No dialogue needed. \
No title. Plain text only, no formatting."""

    response = ollama.chat(model=OLLAMA_MODEL, messages=[{"role": "user", "content": prompt}])
    return response["message"]["content"]


FALLBACK_STORY = (
    "There's a small lake near a quiet trail where the water stays still most mornings, "
    "reflecting whatever sky happens to be there that day — sometimes grey, sometimes clear. "
    "A woman who walks there often stopped noticing the sky a while ago; she was usually thinking "
    "about everything waiting for her back home. One day she sat instead of walking past, just for "
    "a few minutes. Nothing about her problems changed in that time. But she noticed the water was "
    "completely still, and for those few minutes, so was she. She got up eventually and kept going — "
    "not because the lake fixed anything, but because she remembered that stillness was still "
    "possible, even in the middle of a hard week."
)


@app.get("/stories/suggest")
def suggest_story(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recent = (
        db.query(Checkin)
        .filter(
            Checkin.user_id == current_user.id,
            Checkin.trigger_category.isnot(None),
            Checkin.trigger_category.notin_(["neutral", "risk_escalation"]),
        )
        .order_by(Checkin.timestamp.desc())
        .limit(5)
        .all()
    )
    if not recent:
        category = "general"
    else:
        category = Counter(c.trigger_category for c in recent).most_common(1)[0][0]

    return {"suggested_category": category}


class StoryRequest(BaseModel):
    category: str


@app.post("/stories/tell")
def tell_story(
    req: StoryRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        story = generate_story(req.category)
    except Exception as e:
        print(f"Story generation failed ({e}); using fallback story.")
        story = FALLBACK_STORY
    return {"story": story, "category": req.category}

@app.get("/insights")
def insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    checkins = db.query(Checkin).filter(Checkin.user_id == current_user.id).all()

    category_counts = Counter(
        c.trigger_category for c in checkins
        if c.trigger_category and c.trigger_category not in ("risk_escalation", "neutral")
    )
    weekday_counts = Counter(c.timestamp.strftime("%A") for c in checkins)

    categories = list(category_counts.keys())
    scores_by_category = {cat: compute_scores(db, current_user.id, cat) for cat in categories}

    checkin_dates = sorted({c.timestamp.date() for c in checkins}, reverse=True)
    streak_days = 0
    if checkin_dates and (date.today() - checkin_dates[0]).days <= 1:
        streak_days = 1
        current = checkin_dates[0]
        for d in checkin_dates[1:]:
            if (current - d).days == 1:
                streak_days += 1
                current = d
            else:
                break

        return {
        "total_checkins": len(checkins),
        "top_category": category_counts.most_common(1)[0][0] if category_counts else None,
        "category_counts": dict(category_counts),
        "scores_by_category": scores_by_category,
        "weekday_counts": dict(weekday_counts),
        "streak_days": streak_days,
        "pattern_note": build_pattern_note(category_counts.most_common(1)[0][0] if category_counts else None),
        "weekly_trend": build_weekly_trend(checkins),
    }

CATEGORY_COPING_NOTES = {
    "academic": "When academic pressure comes up often, breaking work into small pieces before a deadline — rather than one big block — tends to help many people feel less stuck.",
    "social": "When loneliness or social stress shows up repeatedly, small, low-pressure contact (a short message to one person, not a big plan) is often easier to start with than it feels.",
    "self_esteem": "When self-critical thoughts come up a lot, writing them down and answering them in your own words — rather than trying to argue them away mentally — tends to make them feel less absolute over time.",
    "general": "Noticing when stress tends to show up is itself useful information — it's often the first step to responding to it earlier.",
    "low_energy": "Low energy and low motivation often improve more from one small action than from waiting to feel ready — the motivation tends to follow the action, not the other way around.",
}


def build_pattern_note(top_category):
    if not top_category:
        return None
    return CATEGORY_COPING_NOTES.get(top_category, CATEGORY_COPING_NOTES["general"])


def build_weekly_trend(checkins):
    from datetime import date, timedelta

    today = date.today()
    weeks = []
    for i in range(3, -1, -1):
        week_start = today - timedelta(days=today.weekday() + 7 * i)
        week_end = week_start + timedelta(days=6)
        count = sum(1 for c in checkins if week_start <= c.timestamp.date() <= week_end)
        weeks.append({"week_start": week_start.isoformat(), "count": count})
    return weeks


class GuidelineRequest(BaseModel):
    text: str


@app.post("/guidelines")
def add_guideline(
    req: GuidelineRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    guideline = UserGuideline(user_id=current_user.id, text=req.text.strip())
    db.add(guideline)
    db.commit()
    db.refresh(guideline)
    return {"id": guideline.id, "text": guideline.text}


@app.get("/guidelines")
def list_guidelines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    guidelines = (
        db.query(UserGuideline)
        .filter(UserGuideline.user_id == current_user.id)
        .order_by(UserGuideline.created_at.desc())
        .all()
    )
    return [{"id": g.id, "text": g.text} for g in guidelines]


@app.delete("/guidelines/{guideline_id}")
def delete_guideline(
    guideline_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserGuideline).filter(
        UserGuideline.id == guideline_id, UserGuideline.user_id == current_user.id
    ).delete()
    db.commit()
    return {"status": "deleted"}

@app.delete("/me/data")
def delete_my_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Checkin).filter(Checkin.user_id == current_user.id).delete()
    db.query(InterventionEvent).filter(InterventionEvent.user_id == current_user.id).delete()
    db.commit()
    SESSIONS.pop(current_user.id, None)
    return {"status": "deleted"}


@app.get("/health")
def health():
    return {"status": "ok", "mode": "real" if USE_REAL_API else "mock"}