"""
Small-scale, real retrieval-augmented generation for ChatalystArcade.

Not a mockup: this embeds a curated set of psychoeducation snippets using a
real embedding model (nomic-embed-text via Ollama), and at query time embeds
the user's message and does real cosine-similarity search against them. At
hackathon scale on purpose — same core mechanism as production RAG, just a
small knowledge base instead of a full document store.
"""

import math

EMBED_MODEL = "nomic-embed-text"

# Original, plain-language psychoeducation notes — not copied from any
# textbook. Small and curated on purpose: proves the retrieval mechanism
# genuinely works without needing a large document corpus.
KNOWLEDGE_BASE = [
    {
        "topic": "Why anxiety feels physical",
        "text": "Anxiety triggers the body's fight-or-flight response — a rush of adrenaline that raises heart rate and tenses muscles, preparing the body to react to danger. This is why stress can feel physical (racing heart, tight chest) even when there's no real physical threat, like before an exam.",
    },
    {
        "topic": "All-or-nothing thinking",
        "text": "A common cognitive distortion is all-or-nothing thinking — seeing a situation as a total success or a total failure with no middle ground, like believing one bad grade means someone is a failure at everything. Naming this pattern is often the first step to loosening its grip.",
    },
    {
        "topic": "Why grounding techniques work",
        "text": "Grounding techniques like naming things you can see, hear, or touch work by redirecting attention away from anxious thoughts about the past or future and back to the present moment, which can lower the intensity of a stress response in the short term.",
    },
    {
        "topic": "Why writing about feelings helps",
        "text": "Research on expressive writing has found that putting difficult emotions into words — even briefly — can reduce how much they weigh on someone's mind, likely because organizing a chaotic feeling into language makes it easier for the brain to process.",
    },
    {
        "topic": "Why small actions lift low mood",
        "text": "When someone feels low, motivation often doesn't come first — action does. Behavioral activation is the idea that taking a small, concrete action (even something tiny) tends to improve mood afterward, rather than waiting to feel motivated before acting.",
    },
    {
        "topic": "Why social comparison hurts self-esteem",
        "text": "Comparing yourself to curated versions of other people's lives — especially on social media — tends to lower self-esteem, because you're comparing your full, ordinary experience to someone else's edited highlights, which is an unfair comparison by design.",
    },
    {
        "topic": "Imposter feelings in academics",
        "text": "Feeling like you don't belong or aren't as capable as your peers despite evidence of your own competence is common enough to have a name — imposter feelings. It tends to show up most in high-pressure environments and often has little to do with actual ability.",
    },
    {
        "topic": "The procrastination-anxiety loop",
        "text": "Procrastination is often driven by anxiety about a task, not laziness — avoiding the task temporarily relieves the anxious feeling, which reinforces avoidance as a coping habit, even though it usually increases stress later.",
    },
    {
        "topic": "Self-compassion versus self-criticism",
        "text": "Talking to yourself the way you'd talk to a friend going through the same struggle — rather than harshly criticizing yourself — is associated with better emotional resilience, not lower standards.",
    },
        {
        "topic": "Sleep and stress feed each other",
        "text": "Poor sleep and high stress reinforce each other in a loop: stress makes it harder to fall asleep, and lack of sleep makes the brain more reactive to stress the next day, which is why sleep is often one of the first things worth protecting during a stressful period.",
    },
    {
        "topic": "Why the brain can't actually multitask",
        "text": "What feels like multitasking is really the brain rapidly switching between tasks, and each switch has a real cost — attention and accuracy dip every time you jump back and forth, even if it feels efficient in the moment. Focusing on one thing at a time is usually faster overall than juggling several.",
    },
    {
        "topic": "Why a nearby phone still distracts you",
        "text": "Just having a phone visible nearby — even turned off — has been shown to quietly use up a small amount of mental bandwidth, since part of the brain stays aware of it as a possible source of interruption. Moving it out of sight, not just silencing it, tends to make a real difference to focus.",
    },
    {
        "topic": "Why short breaks restore focus better than powering through",
        "text": "Attention isn't a switch that's either on or off — it fades gradually with sustained effort, and brief breaks (even a minute or two) let it recover before continuing. Pushing through fatigue without pausing tends to produce lower-quality focus than working in shorter stretches with real breaks between them.",
    },
    {
        "topic": "Mind-wandering isn't wasted time",
        "text": "Letting your mind drift during a quiet, low-effort moment — like a walk or a shower — activates a different mode of brain activity that's linked to creative problem-solving, not distraction. This is part of why answers to a stuck problem often show up when you've stopped actively trying to force one.",
    },
    {
        "topic": "Burnout is different from ordinary stress",
        "text": "Ordinary stress usually eases once the stressful event passes, but burnout is what happens when stress responses never get the chance to fully complete — leaving someone in a persistent state of depletion even after the original pressure is gone. Recovering from burnout generally needs deliberate rest, not just fewer things to do.",
    },
]


_embedded_cache = None  # list of (topic, text, vector) once initialized


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _embed(text: str):
    import ollama
    response = ollama.embeddings(model=EMBED_MODEL, prompt=text)
    return response["embedding"]


def init_knowledge_base():
    """Embeds every snippet once, at startup. Raises if Ollama or the
    embedding model isn't available — the caller decides how to handle that."""
    global _embedded_cache
    _embedded_cache = []
    for item in KNOWLEDGE_BASE:
        vector = _embed(item["text"])
        _embedded_cache.append((item["topic"], item["text"], vector))


def retrieve(message: str, threshold: float = 0.55):
    """Returns (topic, text) for the closest snippet if it's genuinely
    similar enough, otherwise None. Real cosine similarity, not keyword
    matching."""
    if not _embedded_cache:
        return None
    query_vector = _embed(message)
    best = None
    best_score = threshold
    for topic, text, vector in _embedded_cache:
        score = _cosine(query_vector, vector)
        if score > best_score:
            best_score = score
            best = (topic, text)
    return best