import { useState } from "react";

const API_BASE = "http://localhost:8000/api/games/reframe-garden";
const MAX_STAGE = 6;

function GardenSVG({ stage }) {
  const growth = Math.min(stage / MAX_STAGE, 1);
  const stemHeight = 20 + growth * 90;
  const leafOpacity = (min) => (growth > min ? 1 : 0);

  return (
    <svg viewBox="0 0 200 220" width="100%" height="100%" role="img" aria-label="A garden that grows as reframes get stronger">
      <ellipse cx="100" cy="200" rx="70" ry="10" fill="#E3DCC8" />
      <path d="M70 205 L75 165 Q100 155 125 165 L130 205 Z" fill="#C9A66B" />
      <rect x="97" y={200 - stemHeight} width="6" height={stemHeight} rx="3" fill="#52734D" />
      <ellipse
        cx="88"
        cy={200 - stemHeight * 0.55}
        rx="16"
        ry="8"
        fill="#6B8E63"
        opacity={leafOpacity(0.15)}
        transform={`rotate(-25 88 ${200 - stemHeight * 0.55})`}
      />
      <ellipse
        cx="112"
        cy={200 - stemHeight * 0.75}
        rx="16"
        ry="8"
        fill="#6B8E63"
        opacity={leafOpacity(0.4)}
        transform={`rotate(25 112 ${200 - stemHeight * 0.75})`}
      />
      <g opacity={leafOpacity(0.75)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse
            key={i}
            cx="100"
            cy={200 - stemHeight - 6}
            rx="14"
            ry="7"
            fill="#8C6B94"
            transform={`rotate(${i * 72} 100 ${200 - stemHeight - 6})`}
          />
        ))}
        <circle cx="100" cy={200 - stemHeight - 6} r="6" fill="#E9C874" />
      </g>
    </svg>
  );
}

export default function ReframeGarden({ stressContext = "school and exam pressure", triggerCategory, token }) {
  const [sessionId, setSessionId] = useState(null);
  const [round, setRound] = useState(0);
  const [gardenStage, setGardenStage] = useState(0);
  const [criticThought, setCriticThought] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [input, setInput] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function startGame() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stress_context: stressContext, trigger_category: triggerCategory }),
      });
      if (!res.ok) throw new Error("Could not start the game.");
      const data = await res.json();
      setSessionId(data.session_id);
      setRound(data.round);
      setGardenStage(data.garden_stage);
      setCriticThought(data.critic_thought);
      setFeedback(null);
      setGameOver(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitReframe() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, user_reframe: input.trim() }),
      });
      if (!res.ok) throw new Error("Could not send that reframe.");
      const data = await res.json();
      setFeedback(data.feedback);
      setGardenStage(data.garden_stage);
      setGameOver(data.game_over);
      if (!data.game_over) {
        setRound(data.round);
        setCriticThought(data.critic_thought);
      } else {
        setCriticThought(null);
      }
      setInput("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rfg-root">
      <style>{`
        .rfg-root {
          --ink: #2B3328;
          --bg: #EFF1E9;
          --panel: #FFFFFF;
          --border: #DCE1D3;
          --critic: #6B5A73;
          --growth: #52734D;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ink);
          background: var(--bg);
          border-radius: 18px;
          padding: 28px;
          max-width: 820px;
          margin: 0 auto;
        }
        .rfg-title {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 4px;
        }
        .rfg-sub {
          font-size: 14px;
          color: #5B6355;
          margin: 0 0 24px;
          max-width: 46ch;
        }
        .rfg-layout {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 28px;
          align-items: start;
        }
        @media (max-width: 640px) {
          .rfg-layout { grid-template-columns: 1fr; }
          .rfg-garden { max-width: 220px; margin: 0 auto; }
        }
        .rfg-garden { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
        .rfg-panel {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px 22px;
          min-height: 220px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .rfg-critic {
          font-family: 'Fraunces', Georgia, serif;
          font-style: italic;
          font-size: 19px;
          color: var(--critic);
          line-height: 1.4;
          border-left: 3px solid var(--critic);
          padding-left: 14px;
        }
        .rfg-feedback {
          font-size: 14px;
          color: var(--growth);
          background: #EEF3EA;
          border-radius: 8px;
          padding: 10px 14px;
        }
        .rfg-textarea {
          font-family: inherit;
          font-size: 15px;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 10px;
          resize: vertical;
          min-height: 70px;
          background: #FBFBF8;
        }
        .rfg-textarea:focus { outline: 2px solid var(--growth); outline-offset: 1px; }
        .rfg-button {
          align-self: flex-start;
          background: var(--growth);
          color: white;
          border: none;
          border-radius: 999px;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .rfg-button:disabled { opacity: 0.5; cursor: default; }
        .rfg-button.secondary {
          background: transparent;
          color: var(--growth);
          border: 1px solid var(--growth);
        }
        .rfg-round { font-size: 12px; color: #808A73; }
        .rfg-error { font-size: 13px; color: #9A4B4B; }
      `}</style>

      <h2 className="rfg-title">Reframe Garden</h2>
      <p className="rfg-sub">
        Each thought your inner critic voices, try answering with something truer and
        kinder. A grounded reframe helps something grow.
      </p>

      <div className="rfg-layout">
        <div className="rfg-garden">
          <GardenSVG stage={gardenStage} />
        </div>

        <div className="rfg-panel">
          {!sessionId && !gameOver && (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                Ready to start? ChatalystArcade will voice a thought — you write the reframe.
              </p>
              <button className="rfg-button" onClick={startGame} disabled={loading}>
                {loading ? "Starting…" : "Begin"}
              </button>
            </>
          )}

          {sessionId && !gameOver && (
            <>
              <span className="rfg-round">Round {round} of 3</span>
              {criticThought && <p className="rfg-critic">&ldquo;{criticThought}&rdquo;</p>}
              {feedback && <p className="rfg-feedback">{feedback}</p>}
              <textarea
                className="rfg-textarea"
                placeholder="Write a more balanced way to see it…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="rfg-button" onClick={submitReframe} disabled={loading || !input.trim()}>
                {loading ? "Thinking…" : "Water it"}
              </button>
            </>
          )}

          {gameOver && (
            <>
              <p className="rfg-feedback">{feedback}</p>
              <p style={{ margin: 0, fontSize: 14 }}>
                Your garden grew a little today. Come back anytime for another round.
              </p>
              <button className="rfg-button secondary" onClick={startGame}>
                Play again
              </button>
            </>
          )}

          {error && <p className="rfg-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}