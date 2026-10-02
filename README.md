# Mindora 🧠✨
> **MedVision Ideathon 2026 Project**  
> An AI-driven digital mental health and psychological support platform providing 24/7 CBT interventions, grounded RAG psychoeducation, and interactive stress-mitigation mini-games.

---

## ✨ Key Features

- **Real-time AI Triage & Chat:** Context-aware emotional support powered by a local `Llama 3.1 8B` model.
- **Grounding & RAG Knowledge Engine:** Semantic vector retrieval using `nomic-embed-text` against evidence-based CBT psychoeducation materials.
- **Interactive Interventions & Arcade:**
  - **Reframe Garden:** Interactive CBT-based cognitive reframing game.
  - **Guided Breathing:** Real-time visual pacing for physiological de-escalation.
  - **Grounding Exercises:** 5-4-3-2-1 sensory exercises for acute anxiety.
- **Crisis Safety Guardrails:** Automated crisis language detection with emergency hotline shortcuts (e.g., Tele-MANAS).
- **Private & Local-First:** Runs on a local LLM runner via Ollama—ensuring zero sensitive emotional data leaves the user's local network.

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Tailwind CSS, Lucide React
- **Backend:** FastAPI (Python), SQLAlchemy, SQLite
- **AI / ML:** Ollama (`llama3.1:8b`), RAG via `nomic-embed-text`
- **Environment:** macOS / Linux, Python 3.10+, Node.js 18+

---

## 🚀 Quick Start Guide

### Prerequisites
1. **Node.js & npm**
2. **Python 3.10+**
3. **Ollama running locally with required models:**
   ```bash
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text

