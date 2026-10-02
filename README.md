# ChatalystArcade — local dev setup

## 1. Backend (FastAPI + Claude API)

    cd backend
    pip install -r requirements.txt
    cp .env.example .env        # then paste your real Anthropic API key into .env
    uvicorn main:app --reload   # runs on http://localhost:8000

## 2. Frontend (Vite + React)

    cd frontend
    npm install
    npm run dev                 # runs on http://localhost:5173

Open http://localhost:5173 in your browser — the chat now calls the real
Claude API through your backend, classifies the trigger category, and hands
off to the intervention screen once it has enough context.

## Next steps (not built yet)
- Trigger-category-aware intervention selection (currently always picks the
  highest-scoring intervention regardless of category)
- Persisting scores/history to a real database instead of in-memory dicts
- Wiring the "risk_escalation" category to real helpline content
