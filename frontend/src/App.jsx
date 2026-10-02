import { useState, useEffect } from "react";
import { MessageCircle, Wind, BarChart3, Send, AlertTriangle, Heart, LogOut, Trash2, BookOpen } from "lucide-react";
import ReframeGarden from "./ReframeGarden";

const BACKEND_URL = "http://localhost:8000";

const INTERVENTIONS = [
  { id: "breathing", label: "Guided breathing" },
  { id: "low_energy", label: "Gentle mood lift" },
  { id: "grounding", label: "Grounding exercise" },
  { id: "reframing", label: "Cognitive reframing" },
  { id: "journaling", label: "Journaling prompt" },
  { id: "audio_lift", label: "A little lift" },
  { id: "story_game", label: "Choose your path" },
  { id: "reframe_garden", label: "Reframe Garden" },
  { id: "calm_quest", label: "Calm Quest" },
  { id: "trivia", label: "Quick Trivia" },
  { id: "word_ladder", label: "Word Ladder" },
];
export default function App() {
  const [auth, setAuth] = useState(null); // { token, email } once logged in

  if (!auth) {
    return <AuthScreen onAuthed={setAuth} />;
  }

    return <ChatalystArcade auth={auth} onLogout={() => setAuth(null)} />;
}

function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Something went wrong.");
        return;
      }
      onAuthed({ token: data.token, email: data.email });
    } catch (err) {
      setError("Couldn't reach the server. Is the backend running on localhost:8000?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-[640px] w-full max-w-3xl mx-auto rounded-2xl"
      style={{ background: "#F3EFE6", fontFamily: "system-ui, sans-serif" }}
    >
      <h1 className="text-3xl mb-1" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>
        ChatalystArcade
      </h1>
      <p className="text-sm mb-8" style={{ color: "#1F3A36", opacity: 0.7 }}>
        {mode === "login" ? "Welcome back." : "Let's get you set up."}
      </p>

      <div className="flex flex-col gap-3 w-72">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-3 rounded-full text-sm outline-none"
          style={{ background: "#E4E7DC", color: "#1F3A36" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="px-4 py-3 rounded-full text-sm outline-none"
          style={{ background: "#E4E7DC", color: "#1F3A36" }}
        />
        {error && <p className="text-xs" style={{ color: "#8C5B6F" }}>{error}</p>}
        <button
          onClick={submit}
          disabled={loading || !email || !password}
          className="px-4 py-3 rounded-full text-sm font-medium disabled:opacity-50"
          style={{ background: "#8C5B6F", color: "#F3EFE6" }}
        >
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </div>

      <button
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
        className="mt-6 text-xs underline"
        style={{ color: "#1F3A36", opacity: 0.6 }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}

function ChatalystArcade({ auth, onLogout }) {
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState([
    { from: "ChatalystArcade", text: "Quick note before we start: I'm an AI, not a licensed therapist or doctor. I can help with everyday stress, but if you're in crisis, please reach out to a real person — I'll always point you to one if things sound serious." },
    { from: "ChatalystArcade", text: "Hey — I'm here. What's on your mind today?" },
  ]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [currentTriggerCategory, setCurrentTriggerCategory] = useState(null);
  const [latestScores, setLatestScores] = useState(null);
  const [activeIntervention, setActiveIntervention] = useState(null);
  const [adaptNote, setAdaptNote] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [simulateRisk, setSimulateRisk] = useState(false);
  const [accountInsights, setAccountInsights] = useState(null);

  useEffect(() => {
    if (view !== "insights") return;
    fetch(`${BACKEND_URL}/insights`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then((res) => res.json())
      .then(setAccountInsights)
      .catch(() => {});
  }, [view]);

  async function sendMessage() {
    if (!draft.trim() || sending) return;
    const text = draft;
    setMessages((m) => [...m, { from: "user", text }]);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json();

      setSessionId(data.session_id);
      setMessages((m) => [...m, { from: "ChatalystArcade", text: data.reply, groundedTopic: data.grounded_topic }]);

      if (data.trigger_category === "risk_escalation") {
        setEscalated(true);
      } else if (data.ready_for_intervention) {
        setCurrentTriggerCategory(data.trigger_category);
        setActiveIntervention(data.intervention_type);
        setLatestScores(data.scores);
        setView("intervention");
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          from: "ChatalystArcade",
          text: "I'm having trouble reaching the server right now — make sure the backend is running on localhost:8000.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function giveFeedback(helped) {
    const current = activeIntervention;
    if (!current || !currentTriggerCategory) return; // no real intervention active — nothing to record
    try {
      const res = await fetch(`${BACKEND_URL}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          trigger_category: currentTriggerCategory,
          intervention_type: current,
          helped,
        }),
      });
      const data = await res.json();
      setLatestScores(data.scores);

      if (!helped) {
        const next = data.next_intervention;
        setAdaptNote(
          `Noted — ${INTERVENTIONS.find((i) => i.id === current).label.toLowerCase()} didn't help this time. Next time for this kind of stress, I'll try ${INTERVENTIONS.find((i) => i.id === next).label.toLowerCase()} first.`
        );
        setActiveIntervention(next);
      } else {
        setAdaptNote(
          `Good to know. I'll keep leaning on ${INTERVENTIONS.find((i) => i.id === current).label.toLowerCase()} for this kind of stress.`
        );
      }
    } catch (err) {
      setAdaptNote("Couldn't reach the server to save that feedback.");
    }
  }

  const showEscalation = escalated || simulateRisk;

  return (
    <div
      className="flex h-[640px] w-full max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-lg"
      style={{ background: "#F3EFE6" }}
    >
      <div className="flex flex-col items-center gap-6 py-6 w-16" style={{ background: "#1F3A36" }}>
        <NavIcon icon={<MessageCircle size={20} />} active={view === "chat"} onClick={() => setView("chat")} />
        <NavIcon
          icon={<Wind size={20} />}
          active={view === "intervention"}
          onClick={() => activeIntervention && setView("intervention")}
          disabled={!activeIntervention}
        />
        <NavIcon icon={<BarChart3 size={20} />} active={view === "insights"} onClick={() => setView("insights")} />
        <NavIcon icon={<BookOpen size={20} />} active={view === "stories"} onClick={() => setView("stories")} />
        <div className="flex-1" />
        <button onClick={onLogout} className="p-2 rounded-full" style={{ color: "#F3EFE6", opacity: 0.6 }}>
          <LogOut size={18} />
        </button>
        <button
          onClick={async () => {
            if (!window.confirm("Delete all your check-in history and learned patterns? This can't be undone.")) return;
            await fetch(`${BACKEND_URL}/me/data`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${auth.token}` },
            });
            setAccountInsights(null);
            setLatestScores(null);
            setMessages([{ from: "ChatalystArcade", text: "Hey — I'm here. What's on your mind today?" }]);
            setView("chat");
          }}
          className="p-2 rounded-full"
          style={{ color: "#F3EFE6", opacity: 0.6 }}
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-8 overflow-y-auto" style={{ fontFamily: "system-ui, sans-serif" }}>
        <div className="text-xs mb-2" style={{ color: "#1F3A36", opacity: 0.5 }}>{auth.email}</div>
        {showEscalation ? (
          <EscalationScreen onDismiss={() => { setEscalated(false); setSimulateRisk(false); }} />
        ) : view === "chat" ? (
          <ChatView messages={messages} draft={draft} setDraft={setDraft} sendMessage={sendMessage} sending={sending} />
        ) : view === "intervention" ? (
          <InterventionView
            intervention={INTERVENTIONS.find((i) => i.id === activeIntervention) || INTERVENTIONS[0]}
            onFeedback={giveFeedback}
            adaptNote={adaptNote}
            triggerCategory={currentTriggerCategory}
            token={auth.token}
          />
        ) : view === "stories" ? (
  <StoriesView token={auth.token} />
) : (
  <InsightsView accountInsights={accountInsights} token={auth.token} />
)}

        <label className="mt-6 flex items-center gap-2 text-xs opacity-50" style={{ color: "#1F3A36" }}>
          <input type="checkbox" checked={simulateRisk} onChange={(e) => setSimulateRisk(e.target.checked)} />
          Demo: simulate high-risk input detected
        </label>
      </div>
    </div>
  );
}

function NavIcon({ icon, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-full transition-colors"
      style={{
        background: active ? "#F3EFE6" : "transparent",
        color: active ? "#1F3A36" : "#F3EFE6",
        opacity: disabled ? 0.25 : active ? 1 : 0.6,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon}
    </button>
  );
}

function ChatView({ messages, draft, setDraft, sendMessage, sending }) {
  return (
    <div className="flex flex-col h-full">
      <h1 className="text-3xl mb-6" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>
        Let's talk it through.
      </h1>
      <div className="flex-1 flex flex-col gap-3 mb-4 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.from === "user" ? "items-end" : "items-start"}`}>
            <div
              className="max-w-[75%] px-4 py-3 text-sm leading-relaxed"
              style={{
                background: m.from === "user" ? "#8C5B6F" : "#E4E7DC",
                color: m.from === "user" ? "#F3EFE6" : "#1F3A36",
                borderRadius: m.from === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              }}
            >
              {m.text}
            </div>
            {m.groundedTopic && (
              <span className="mt-1 px-2 py-0.5 rounded-full text-[10px]" style={{ background: "#E4E7DC", color: "#8C5B6F" }}>
                📚 Grounded in: {m.groundedTopic}
              </span>
            )}
          </div>
        ))}
        {sending && <div className="text-xs opacity-50" style={{ color: "#1F3A36" }}>ChatalystArcade is thinking…</div>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type how you're feeling..."
          className="flex-1 px-4 py-3 rounded-full text-sm outline-none"
          style={{ background: "#E4E7DC", color: "#1F3A36" }}
        />
        <button onClick={sendMessage} className="p-3 rounded-full" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function LowEnergyContent() {
  const suggestions = [
    {
      title: "Do one small, easy thing",
      text: "Something you normally enjoy, even if you don't feel like it right now — a favorite song, a cup of tea, five minutes of sketching.",
    },
    {
      title: "Change your environment",
      text: "Move to a different room, open a window for some light, or take a brief walk outside. A change of scenery can interrupt a low-mood loop.",
    },
    {
      title: "Connect with someone",
      text: "A quick text or call to say hello — nothing heavy, just light contact with someone you trust.",
    },
    {
      title: "Be gentle with yourself",
      text: "It's okay to have an off day. Trying to force yourself to \"snap out of it\" usually adds pressure, not relief.",
    },
  ];

  return (
    <div className="w-full max-w-sm">
      <p className="text-sm mb-4 text-center" style={{ color: "#1F3A36", opacity: 0.8 }}>
        Small, gentle actions can help shift energy without adding pressure. No need to do all of these — just pick one that feels doable.
      </p>
      <div className="flex flex-col gap-3">
        {suggestions.map((s, i) => (
          <div key={i} className="px-4 py-3 rounded-2xl text-left" style={{ background: "#E4E7DC" }}>
            <p className="text-sm font-medium mb-1" style={{ color: "#1F3A36" }}>{s.title}</p>
            <p className="text-xs" style={{ color: "#1F3A36", opacity: 0.75 }}>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InterventionView({ intervention, onFeedback, adaptNote, triggerCategory, token }) {
  const [ready, setReady] = useState(intervention.id === "breathing" || intervention.id === "audio_lift" || intervention.id === "reframe_garden" || intervention.id === "low_energy");
useEffect(() => {
  setReady(intervention.id === "breathing" || intervention.id === "audio_lift" || intervention.id === "reframe_garden" || intervention.id === "low_energy");
}, [intervention.id]);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h2 className="text-2xl mb-2" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>{intervention.label}</h2>

      {intervention.id === "breathing" && <BreathingContent />}
      {intervention.id === "grounding" && !ready && <GroundingContent onDone={() => setReady(true)} />}
      {intervention.id === "reframing" && !ready && <ReframingContent onDone={() => setReady(true)} />}
      {intervention.id === "journaling" && !ready && <JournalingContent onDone={() => setReady(true)} />}
      {intervention.id === "audio_lift" && <AudioLiftContent />}
      {intervention.id === "low_energy" && <LowEnergyContent />}
      {intervention.id === "story_game" && !ready && (
  <StoryGameContent triggerCategory={triggerCategory} token={token} onDone={() => setReady(true)} />
)}
{intervention.id === "calm_quest" && !ready && (
  <CalmQuestContent triggerCategory={triggerCategory} token={token} onDone={() => setReady(true)} />
)}
{intervention.id === "trivia" && !ready && (
  <TriviaContent token={token} onDone={() => setReady(true)} />
)}
{intervention.id === "word_ladder" && !ready && (
  <WordLadderContent token={token} onDone={() => setReady(true)} />
)}
{intervention.id === "reframe_garden" && (
  <ReframeGarden
    stressContext={triggerCategory || "everyday stress"}
    triggerCategory={triggerCategory}
    token={token}
  />
)}

      {ready && (
        <>
          <div className="flex gap-3 mb-4 mt-2">
            <button onClick={() => onFeedback(true)} className="px-5 py-2 rounded-full text-sm" style={{ background: "#6B8F71", color: "#F3EFE6" }}>
              This helped
            </button>
            <button onClick={() => onFeedback(false)} className="px-5 py-2 rounded-full text-sm" style={{ background: "#E4E7DC", color: "#1F3A36" }}>
              Didn't help
            </button>
          </div>
          {adaptNote && <p className="text-xs max-w-sm" style={{ color: "#8C5B6F" }}>{adaptNote}</p>}
        </>
      )}
    </div>
  );
}

function BreathingContent() {
  return (
    <>
      <div
        className="rounded-full mb-6"
        style={{ width: 140, height: 140, background: "radial-gradient(circle, #8C5B6F 0%, #E4E7DC 100%)", animation: "breathe 4s ease-in-out infinite" }}
      />
      <style>{`@keyframes breathe { 0%, 100% { transform: scale(0.85); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }`}</style>
      <p className="text-sm mb-6 max-w-xs" style={{ color: "#1F3A36", opacity: 0.75 }}>
        Breathe in as it grows, breathe out as it shrinks. Follow along at your own pace.
      </p>
    </>
  );
}

const GROUNDING_STEPS = [
  { count: 5, prompt: "things you can see around you" },
  { count: 4, prompt: "things you can physically touch" },
  { count: 3, prompt: "things you can hear right now" },
  { count: 2, prompt: "things you can smell" },
  { count: 1, prompt: "thing you can taste" },
];

function GroundingContent({ onDone }) {
  const [step, setStep] = useState(0);
  const current = GROUNDING_STEPS[step];

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex items-center justify-center rounded-full mb-6 text-3xl font-serif"
        style={{ width: 100, height: 100, background: "#E4E7DC", color: "#8C5B6F" }}
      >
        {current.count}
      </div>
      <p className="text-sm mb-6 max-w-xs" style={{ color: "#1F3A36", opacity: 0.8 }}>
        Name <strong>{current.count}</strong> {current.prompt}. Take your time.
      </p>
      <button
        onClick={() => (step < GROUNDING_STEPS.length - 1 ? setStep(step + 1) : onDone())}
        className="px-5 py-2 rounded-full text-sm"
        style={{ background: "#8C5B6F", color: "#F3EFE6" }}
      >
        {step < GROUNDING_STEPS.length - 1 ? "Next" : "Done"}
      </button>
    </div>
  );
}

function ReframingContent({ onDone }) {
  const [stage, setStage] = useState(0); // 0 = write the thought, 1 = write the reframe
  const [thought, setThought] = useState("");
  const [reframe, setReframe] = useState("");

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <p className="text-sm mb-3" style={{ color: "#1F3A36", opacity: 0.8 }}>
        {stage === 0
          ? "What's the thought that's been stressing you out? Write it exactly as it sounds in your head."
          : "Now, what's a more balanced way to look at it? It doesn't have to feel fully true yet — just less extreme."}
      </p>
      <textarea
        value={stage === 0 ? thought : reframe}
        onChange={(e) => (stage === 0 ? setThought(e.target.value) : setReframe(e.target.value))}
        rows={3}
        className="w-full p-3 rounded-2xl text-sm outline-none mb-4"
        style={{ background: "#E4E7DC", color: "#1F3A36" }}
        placeholder={stage === 0 ? "e.g. I'm going to fail this exam and ruin everything" : "e.g. I haven't failed yet, and one exam doesn't decide everything"}
      />
      <button
        disabled={stage === 0 ? !thought.trim() : !reframe.trim()}
        onClick={() => (stage === 0 ? setStage(1) : onDone())}
        className="px-5 py-2 rounded-full text-sm disabled:opacity-40"
        style={{ background: "#8C5B6F", color: "#F3EFE6" }}
      >
        {stage === 0 ? "Next" : "Done"}
      </button>
    </div>
  );
}

const LIFT_LINES = [
  "Hey — whatever today's been, you showed up and talked about it. That counts for something.",
  "Small reminder: one hard exam, one hard conversation, one hard day — none of them are the whole story.",
  "You don't have to have it all figured out right now. Just this next hour is enough to focus on.",
  "Here's a fact: you've handled every hard day you've had so far. That's a pretty good track record.",
];

function AudioLiftContent() {
  const [line] = useState(LIFT_LINES[Math.floor(Math.random() * LIFT_LINES.length)]);
  const [playing, setPlaying] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  function play() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <p className="text-sm mb-6 italic" style={{ color: "#1F3A36", opacity: 0.85 }}>
        "{line}"
      </p>
      <button
        onClick={play}
        disabled={!supported}
        className="px-5 py-2 rounded-full text-sm disabled:opacity-40"
        style={{ background: "#8C5B6F", color: "#F3EFE6" }}
      >
        {playing ? "Playing..." : "Play it out loud"}
      </button>
      {!supported && (
        <p className="text-xs mt-3" style={{ color: "#1F3A36", opacity: 0.5 }}>
          Your browser doesn't support audio playback — but the words are still here.
        </p>
      )}
    </div>
  );
}

function StoriesView({ token }) {
  const [stage, setStage] = useState("loading"); // loading | suggested | story | error
  const [category, setCategory] = useState(null);
  const [story, setStory] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    fetch(`${BACKEND_URL}/stories/suggest`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setCategory(data.suggested_category);
        setStage("suggested");
      })
      .catch(() => setStage("error"));
  }, []);

  async function tellStory() {
    setStage("loading");
    try {
      const res = await fetch(`${BACKEND_URL}/stories/tell`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category }),
      });
      const data = await res.json();
      setStory(data.story);
      setStage("story");
    } catch {
      setStage("error");
    }
  }

  function playAloud() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(story);
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  const categoryLabel = {
    academic: "academic pressure",
    social: "feeling disconnected",
    self_esteem: "self-doubt",
    general: "everyday stress",
  }[category] || "everyday stress";

  if (stage === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>Finding a story…</p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>Couldn't load a story right now.</p>
      </div>
    );
  }

  if (stage === "suggested") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h1 className="text-3xl mb-4" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>
          Stories
        </h1>
        <p className="text-sm mb-6 max-w-xs" style={{ color: "#1F3A36", opacity: 0.75 }}>
          Based on what's been on your mind lately, ChatalystArcade has a story about {categoryLabel}.
        </p>
        <button
          onClick={tellStory}
          className="px-6 py-3 rounded-full text-sm"
          style={{ background: "#8C5B6F", color: "#F3EFE6" }}
        >
          Tell me the story
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h1 className="text-2xl mb-6" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>
        Stories
      </h1>
      <p className="text-sm mb-8 max-w-md leading-relaxed" style={{ color: "#1F3A36", opacity: 0.85 }}>
        {story}
      </p>
      <div className="flex gap-3">
        <button
          onClick={playAloud}
          disabled={!supported}
          className="px-5 py-2 rounded-full text-sm disabled:opacity-40"
          style={{ background: "#8C5B6F", color: "#F3EFE6" }}
        >
          {speaking ? "Playing…" : "Read it aloud"}
        </button>
        <button
          onClick={() => setStage("suggested")}
          className="px-5 py-2 rounded-full text-sm"
          style={{ background: "#E4E7DC", color: "#1F3A36" }}
        >
          Choose Another Story
        </button>
      </div>
    </div>
  );
}

function StoryGameContent({ triggerCategory, token, onDone }) {
  const [stage, setStage] = useState("loading"); // loading | choosing | outcome | error
  const [scenario, setScenario] = useState(null);
  const [outcome, setOutcome] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/story-game/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trigger_category: triggerCategory || "general" }),
    })
      .then((res) => res.json())
      .then((data) => {
        setScenario(data);
        setStage("choosing");
      })
      .catch(() => setStage("error"));
  }, []);

  async function pickChoice(choiceText) {
    setStage("loading");
    try {
      const res = await fetch(`${BACKEND_URL}/story-game/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scenario: scenario.scenario, choice_text: choiceText }),
      });
      const data = await res.json();
      setOutcome(data.outcome);
      setStage("outcome");
    } catch {
      setStage("error");
    }
  }

  if (stage === "loading") {
    return <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>Writing your scenario...</p>;
  }
  if (stage === "error") {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#1F3A36", opacity: 0.6 }}>Couldn't load the game right now.</p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Skip
        </button>
      </div>
    );
  }
  if (stage === "outcome") {
    return (
      <div className="flex flex-col items-center w-full max-w-xs">
        <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>{outcome}</p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>{scenario.scenario}</p>
      <div className="flex flex-col gap-2 w-full">
        {scenario.choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => pickChoice(choice.text)}
            className="px-4 py-2 rounded-full text-sm"
            style={{ background: "#E4E7DC", color: "#1F3A36" }}
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
function CalmQuestContent({ triggerCategory, token, onDone }) {
  const [stage, setStage] = useState("loading"); // loading | choosing | outcome | error
  const [scenario, setScenario] = useState(null);
  const [choices, setChoices] = useState([]);
  const [outcome, setOutcome] = useState("");
  const [current, setCurrent] = useState(1);
  const [total, setTotal] = useState(3);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/calm-quest/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trigger_category: triggerCategory || "general" }),
    })
      .then((res) => res.json())
      .then((data) => {
        setScenario(data.scenario);
        setChoices(data.choices);
        setCurrent(data.stage);
        setTotal(data.total_stages);
        setStage("choosing");
      })
      .catch(() => setStage("error"));
  }, []);

  async function pickChoice(choiceText) {
    setStage("loading");
    try {
      const res = await fetch(`${BACKEND_URL}/calm-quest/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          trigger_category: triggerCategory || "general",
          scenario,
          choice_text: choiceText,
          stage: current,
        }),
      });
      const data = await res.json();
      setOutcome(data.outcome);
      setComplete(data.complete);
      if (!data.complete) {
        setScenario(data.scenario);
        setChoices(data.choices);
        setCurrent(data.stage);
      }
      setStage("outcome");
    } catch {
      setStage("error");
    }
  }

  if (stage === "loading") {
    return <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>Setting the scene…</p>;
  }
  if (stage === "error") {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#1F3A36", opacity: 0.6 }}>Couldn't load the quest right now.</p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Skip
        </button>
      </div>
    );
  }
  if (stage === "outcome") {
    return (
      <div className="flex flex-col items-center w-full max-w-xs">
        <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>{outcome}</p>
        {complete ? (
          <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
            Done
          </button>
        ) : (
          <button
            onClick={() => setStage("choosing")}
            className="px-5 py-2 rounded-full text-sm"
            style={{ background: "#8C5B6F", color: "#F3EFE6" }}
          >
            Continue
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <span className="text-xs mb-3" style={{ color: "#1F3A36", opacity: 0.5 }}>Stage {current} of {total}</span>
      <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>{scenario}</p>
      <div className="flex flex-col gap-2 w-full">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => pickChoice(choice.text)}
            className="px-4 py-2 rounded-full text-sm"
            style={{ background: "#E4E7DC", color: "#1F3A36" }}
          >
            {choice.text}
          </button>
        ))}
      </div>
    </div>
  );
}
function TriviaContent({ token, onDone }) {
  const [stage, setStage] = useState("loading"); // loading | answering | revealed | error
  const [question, setQuestion] = useState(null);
  const [choices, setChoices] = useState([]);
  const [round, setRound] = useState(1);
  const [total, setTotal] = useState(3);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [funFact, setFunFact] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/trivia/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setQuestion(data.question);
        setChoices(data.choices);
        setRound(data.round);
        setTotal(data.total);
        setFunFact(data.fun_fact || "");
        setStage("answering");
      })
      .catch(() => setStage("error"));
  }, []);

  function pick(choice) {
    setSelected(choice.id);
    if (choice.correct) setScore((s) => s + 1);
    setStage("revealed");
  }

  async function next() {
    setStage("loading");
    setSelected(null);
    try {
      const res = await fetch(`${BACKEND_URL}/trivia/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ round }),
      });
      const data = await res.json();
      if (data.complete) {
        setStage("done");
        return;
      }
      setQuestion(data.question);
      setChoices(data.choices);
      setRound(data.round);
      setFunFact(data.fun_fact || "");
      setStage("answering");
    } catch {
      setStage("error");
    }
  }

  if (stage === "loading") {
    return <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>Loading a question…</p>;
  }
  if (stage === "error") {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#1F3A36", opacity: 0.6 }}>Couldn't load trivia right now.</p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Skip
        </button>
      </div>
    );
  }
  if (stage === "done") {
    return (
      <div className="flex flex-col items-center w-full max-w-xs">
        <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>
          {score} out of {total} — nice little break either way.
        </p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <span className="text-xs mb-3" style={{ color: "#1F3A36", opacity: 0.5 }}>Question {round} of {total}</span>
      <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.9 }}>{question}</p>
      <div className="flex flex-col gap-2 w-full mb-4">
        {choices.map((choice) => {
          let bg = "#E4E7DC";
          if (stage === "revealed") {
            if (choice.correct) bg = "#6B8F71";
            else if (choice.id === selected) bg = "#8C5B6F";
          }
          return (
            <button
              key={choice.id}
              onClick={() => stage === "answering" && pick(choice)}
              disabled={stage === "revealed"}
              className="px-4 py-2 rounded-full text-sm text-left"
              style={{ background: bg, color: stage === "revealed" && (choice.correct || choice.id === selected) ? "#F3EFE6" : "#1F3A36" }}
            >
              {choice.text}
            </button>
          );
        })}
      </div>
      {stage === "revealed" && (
        <>
          {funFact && (
            <p className="text-xs mb-4 text-center" style={{ color: "#1F3A36", opacity: 0.7 }}>
              {funFact}
            </p>
          )}
          <button onClick={next} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
            {round >= total ? "See score" : "Next question"}
          </button>
        </>
      )}
    </div>
  );
}

function WordLadderContent({ onDone, token }) {
  const [stage, setStage] = useState("loading"); // loading | playing | error
  const [word, setWord] = useState("");
  const [breathCue, setBreathCue] = useState("");
  const [round, setRound] = useState(1);
  const [total, setTotal] = useState(5);
  const [input, setInput] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/word-ladder/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setWord(data.word);
        setBreathCue(data.breath_cue);
        setRound(data.round);
        setTotal(data.total);
        setStage("playing");
      })
      .catch(() => setStage("error"));
  }, []);

  async function submitWord() {
    if (!input.trim()) return;
    setStage("loading");
    try {
      const res = await fetch(`${BACKEND_URL}/word-ladder/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_word: input.trim(), round }),
      });
      const data = await res.json();
      setInput("");
      if (data.complete) {
        setStage("done");
        return;
      }
      setWord(data.word);
      setBreathCue(data.breath_cue);
      setRound(data.round);
      setStage("playing");
    } catch {
      setStage("error");
    }
  }

  if (stage === "loading") {
    return <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.6 }}>...</p>;
  }
  if (stage === "error") {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#1F3A36", opacity: 0.6 }}>Couldn't load the game right now.</p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Skip
        </button>
      </div>
    );
  }
  if (stage === "done") {
    return (
      <div className="flex flex-col items-center w-full max-w-xs">
        <p className="text-sm mb-6" style={{ color: "#1F3A36", opacity: 0.85 }}>
          Nice — {total} words, {total} slow breaths. That's a real pause.
        </p>
        <button onClick={onDone} className="px-5 py-2 rounded-full text-sm" style={{ background: "#8C5B6F", color: "#F3EFE6" }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <span className="text-xs mb-3" style={{ color: "#1F3A36", opacity: 0.5 }}>Word {round} of {total}</span>
      <p className="text-3xl mb-2" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>{word}</p>
      <p className="text-xs mb-6 italic" style={{ color: "#1F3A36", opacity: 0.6 }}>{breathCue}</p>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submitWord()}
        placeholder="A word this makes you think of..."
        className="w-full px-4 py-3 rounded-full text-sm outline-none mb-4"
        style={{ background: "#E4E7DC", color: "#1F3A36" }}
      />
      <button
        onClick={submitWord}
        disabled={!input.trim()}
        className="px-5 py-2 rounded-full text-sm disabled:opacity-40"
        style={{ background: "#8C5B6F", color: "#F3EFE6" }}
      >
        Continue
      </button>
    </div>
  );
}
function JournalingContent({ onDone }) {
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <p className="text-sm mb-3" style={{ color: "#1F3A36", opacity: 0.8 }}>
        Write about whatever's been building up today — no structure needed, just let it out.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full p-3 rounded-2xl text-sm outline-none mb-4"
        style={{ background: "#E4E7DC", color: "#1F3A36" }}
        placeholder="Start typing..."
      />
      <button
        disabled={!text.trim()}
        onClick={onDone}
        className="px-5 py-2 rounded-full text-sm disabled:opacity-40"
        style={{ background: "#8C5B6F", color: "#F3EFE6" }}
      >
        I'm done writing
      </button>
    </div>
  );
}

function InsightsView({ accountInsights, token }) {
  const [guidelines, setGuidelines] = useState([]);
  const [newGuideline, setNewGuideline] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/guidelines`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(setGuidelines)
      .catch(() => {});
  }, []);

  async function addGuideline() {
    if (!newGuideline.trim()) return;
    const res = await fetch(`${BACKEND_URL}/guidelines`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: newGuideline.trim() }),
    });
    const data = await res.json();
    setGuidelines((g) => [data, ...g]);
    setNewGuideline("");
  }

  async function removeGuideline(id) {
    await fetch(`${BACKEND_URL}/guidelines/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setGuidelines((g) => g.filter((item) => item.id !== id));
  }

  if (!accountInsights) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm" style={{ color: "#1F3A36", opacity: 0.5 }}>Loading your patterns…</p>
      </div>
    );
  }

  if (accountInsights.total_checkins === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm max-w-xs" style={{ color: "#1F3A36", opacity: 0.6 }}>
          Talk to ChatalystArcade a few times and try some interventions — your patterns will build up here.
        </p>
      </div>
    );
  }

  const { total_checkins, top_category, scores_by_category, weekday_counts, streak_days, pattern_note, weekly_trend } = accountInsights;
  const maxWeekCount = weekly_trend ? Math.max(1, ...weekly_trend.map((w) => w.count)) : 1;

  return (
    <div>
      <h2 className="text-2xl mb-1" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>Your patterns</h2>
      <p className="text-xs mb-2" style={{ color: "#1F3A36", opacity: 0.6 }}>
        {total_checkins} check-ins so far{top_category ? ` · most often about ${top_category.replace("_", " ")} stress` : ""}
      </p>
      {streak_days > 0 && (
        <p className="text-xs mb-4 font-medium" style={{ color: "#8C5B6F" }}>
          🔥 {streak_days}-day check-in streak
        </p>
      )}

      {pattern_note && (
        <div className="mb-6 px-4 py-3 rounded-2xl text-xs" style={{ background: "#E4E7DC", color: "#1F3A36" }}>
          {pattern_note}
        </div>
      )}

      {weekly_trend && (
        <div className="mb-6">
          <p className="text-sm mb-2" style={{ color: "#1F3A36", opacity: 0.8 }}>Check-ins over the last 4 weeks</p>
          <div className="flex items-end gap-3 h-20">
            {weekly_trend.map((w, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{ height: `${(w.count / maxWeekCount) * 100}%`, minHeight: w.count > 0 ? 4 : 0, background: "#8C5B6F" }}
                />
                <span className="text-[10px] mt-1" style={{ color: "#1F3A36", opacity: 0.5 }}>{w.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.entries(scores_by_category).map(([category, scores]) => (
        <div key={category} className="mb-6">
          <p className="text-sm mb-2 capitalize" style={{ color: "#1F3A36", opacity: 0.8 }}>
            {category.replace("_", " ")}
          </p>
          <div className="flex flex-col gap-3">
            {Object.entries(scores).map(([id, score]) => (
              <div key={id}>
                <div className="flex justify-between text-xs mb-1" style={{ color: "#1F3A36" }}>
                  <span>{INTERVENTIONS.find((i) => i.id === id)?.label || id}</span>
                  <span style={{ opacity: 0.6 }}>{score}%</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "#E4E7DC" }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${score}%`, background: "#8C5B6F" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {Object.keys(weekday_counts).length > 0 && (
        <div className="mb-6">
          <p className="text-sm mb-2" style={{ color: "#1F3A36", opacity: 0.8 }}>When you tend to check in</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(weekday_counts).map(([day, count]) => (
              <span key={day} className="px-3 py-1 rounded-full" style={{ background: "#E4E7DC", color: "#1F3A36" }}>
                {day}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm mb-1" style={{ color: "#1F3A36", opacity: 0.8 }}>My Guidelines</p>
        <p className="text-xs mb-3" style={{ color: "#1F3A36", opacity: 0.5 }}>
          Personal reminders you write for yourself — ChatalystArcade just helps you keep track.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={newGuideline}
            onChange={(e) => setNewGuideline(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGuideline()}
            placeholder="e.g. Take a 5 min break every hour when studying"
            className="flex-1 px-3 py-2 rounded-full text-xs outline-none"
            style={{ background: "#E4E7DC", color: "#1F3A36" }}
          />
          <button
            onClick={addGuideline}
            className="px-4 py-2 rounded-full text-xs"
            style={{ background: "#8C5B6F", color: "#F3EFE6" }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {guidelines.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-3 py-2 rounded-2xl text-xs" style={{ background: "#F3EFE6", border: "1px solid #E4E7DC", color: "#1F3A36" }}>
              <span>{g.text}</span>
              <button onClick={() => removeGuideline(g.id)} style={{ color: "#8C5B6F", opacity: 0.7 }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EscalationScreen({ onDismiss }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4">
      <AlertTriangle size={36} style={{ color: "#8C5B6F" }} />
      <h2 className="text-xl" style={{ fontFamily: "Georgia, serif", color: "#1F3A36" }}>
        This sounds like more than ChatalystArcade can help with alone
      </h2>
      <p className="text-sm max-w-sm" style={{ color: "#1F3A36", opacity: 0.75 }}>
        We'd rather connect you with a real person right now. You can reach a counsellor or a
        crisis line — you don't have to go through this by yourself.
      </p>
      <div className="flex flex-col items-center gap-1 text-sm" style={{ color: "#6B8F71" }}>
        <div className="flex items-center gap-2">
          <Heart size={16} /> Tele-MANAS (Govt. of India) — free, 24/7, 20+ languages
        </div>
        <div className="font-medium" style={{ color: "#1F3A36" }}>Call 14416 or 1-800-891-4416</div>
      </div>
      <button onClick={onDismiss} className="mt-2 px-4 py-2 rounded-full text-xs" style={{ background: "#E4E7DC", color: "#1F3A36" }}>
        Close demo
      </button>
    </div>
  );
}