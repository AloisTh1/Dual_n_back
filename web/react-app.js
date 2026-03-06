import {
  determineNextLevel,
  evaluateResponses,
  evaluateRoundFeedback,
  generateSequence,
  startLevelFromHistory,
} from "./gameLogic.js";

const { createElement: h, useEffect, useMemo, useRef, useState } = React;

const HISTORY_KEY = "dnb_history_v1";
const TUTORIAL_KEY = "dnb_tutorial_hidden_v1";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function isTutorialHidden() {
  return localStorage.getItem(TUTORIAL_KEY) === "1";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickPreferredVoice(voices) {
  const preferredTokens = ["zira", "samantha", "victoria", "female", "ava", "aria", "susan", "serena"];
  const lowerVoices = voices.map((v) => ({ voice: v, name: v.name.toLowerCase() }));
  for (const token of preferredTokens) {
    const hit = lowerVoices.find((v) => v.name.includes(token));
    if (hit) return hit.voice;
  }
  return voices.find((v) => v.lang?.toLowerCase().startsWith("en")) || voices[0] || null;
}

function speakLetter(letter, voice) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(letter);
  utterance.rate = 0.72;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function App() {
  const [history, setHistory] = useState(() => loadHistory());
  const [level, setLevel] = useState(() => startLevelFromHistory(loadHistory()));
  const [rounds, setRounds] = useState(20);
  const [stimulusMs, setStimulusMs] = useState(1500);
  const [gapMs, setGapMs] = useState(1000);
  const [positionKey, setPositionKey] = useState("a");
  const [letterKey, setLetterKey] = useState("l");
  const [statusText, setStatusText] = useState("Ready.");
  const [scoreText, setScoreText] = useState("Score: -");
  const [activeStimulus, setActiveStimulus] = useState(null);
  const [activeRound, setActiveRound] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [positionFeedback, setPositionFeedback] = useState("neutral");
  const [letterFeedback, setLetterFeedback] = useState("neutral");
  const [feedbackTile, setFeedbackTile] = useState(null);
  const [pressedPosition, setPressedPosition] = useState(false);
  const [pressedAudio, setPressedAudio] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !isTutorialHidden());
  const [ttsVoice, setTtsVoice] = useState(null);

  const responsesRef = useRef([]);
  const pressedPositionTimerRef = useRef(null);
  const pressedAudioTimerRef = useRef(null);
  const feedbackTileTimerRef = useRef(null);

  useEffect(() => {
    function onKeyDown(event) {
      if (activeRound < 0 || activeRound >= responsesRef.current.length) return;
      const k = event.key.toLowerCase();
      if (k === positionKey || k === letterKey) {
        responsesRef.current[activeRound].add(k);
      }
      if (k === positionKey) {
        setPressedPosition(true);
        if (pressedPositionTimerRef.current) clearTimeout(pressedPositionTimerRef.current);
        pressedPositionTimerRef.current = setTimeout(() => setPressedPosition(false), 180);
      }
      if (k === letterKey) {
        setPressedAudio(true);
        if (pressedAudioTimerRef.current) clearTimeout(pressedAudioTimerRef.current);
        pressedAudioTimerRef.current = setTimeout(() => setPressedAudio(false), 180);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (pressedPositionTimerRef.current) clearTimeout(pressedPositionTimerRef.current);
      if (pressedAudioTimerRef.current) clearTimeout(pressedAudioTimerRef.current);
    };
  }, [activeRound, positionKey, letterKey]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    function loadVoices() {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setTtsVoice(pickPreferredVoice(voices));
      }
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (feedbackTile == null || positionFeedback === "neutral") return;
    if (feedbackTileTimerRef.current) clearTimeout(feedbackTileTimerRef.current);
    feedbackTileTimerRef.current = setTimeout(() => setFeedbackTile(null), 420);
    return () => {
      if (feedbackTileTimerRef.current) clearTimeout(feedbackTileTimerRef.current);
    };
  }, [feedbackTile, positionFeedback]);

  const historyRows = useMemo(() => history.slice().reverse(), [history]);

  async function runSession() {
    const posKey = positionKey.trim().toLowerCase();
    const letKey = letterKey.trim().toLowerCase();

    if (!posKey || !letKey || posKey === letKey) {
      throw new Error("Position and letter keys must be different and non-empty.");
    }

    const sequence = generateSequence({ n: level, rounds });
    responsesRef.current = Array.from({ length: rounds }, () => new Set());

    for (let i = 0; i < sequence.length; i += 1) {
      setActiveRound(i);
      setStatusText(`Round ${i + 1}/${rounds}`);
      setActiveStimulus(sequence[i]);
      speakLetter(sequence[i].letter, ttsVoice);
      await sleep(stimulusMs);
      setActiveStimulus(null);
      await sleep(gapMs);

      const feedback = evaluateRoundFeedback({
        sequence,
        responses: responsesRef.current,
        n: level,
        index: i,
        positionKey: posKey,
        letterKey: letKey,
      });
      setPositionFeedback(feedback.positionOutcome);
      setLetterFeedback(feedback.letterOutcome);
      setFeedbackTile(sequence[i].position);
    }

    setActiveRound(-1);

    return evaluateResponses({
      sequence,
      responses: responsesRef.current,
      n: level,
      positionKey: posKey,
      letterKey: letKey,
    });
  }

  async function startSession() {
    if (isRunning) return;

    try {
      setIsRunning(true);
      setStatusText(`Starting dual ${level}-back`);
      setScoreText("Score: ...");
      setPositionFeedback("neutral");
      setLetterFeedback("neutral");
      setFeedbackTile(null);

      const result = await runSession();
      const nextLevel = determineNextLevel(level, result.score);

      const entry = {
        timestamp: new Date().toISOString(),
        level,
        score: result.score,
        passed: result.passed,
        correctDecisions: result.correctDecisions,
        totalDecisions: result.totalDecisions,
      };

      const updatedHistory = [...history, entry];
      saveHistory(updatedHistory);
      setHistory(updatedHistory);

      setScoreText(
        `Score: ${(result.score * 100).toFixed(1)}% (${result.correctDecisions}/${result.totalDecisions})`,
      );
      setStatusText(
        result.passed
          ? `Passed. Next level is dual ${nextLevel}-back.`
          : `Failed. Repeat dual ${level}-back.`,
      );

      if (result.passed) {
        setLevel(nextLevel);
      }
    } catch (error) {
      setStatusText(error.message);
    } finally {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (feedbackTileTimerRef.current) clearTimeout(feedbackTileTimerRef.current);
      setIsRunning(false);
      setActiveRound(-1);
      setActiveStimulus(null);
      setFeedbackTile(null);
    }
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
    setLevel(3);
    setStatusText("History cleared.");
    setScoreText("Score: -");
    setPositionFeedback("neutral");
    setLetterFeedback("neutral");
    setFeedbackTile(null);
  }

  return h(
    "main",
    { className: "app" },
    h(
      "header",
      null,
      h("h1", null, "Dual N-Back"),
      h("p", null, "Position on grid + spoken letter"),
      h(
        "button",
        {
          className: "tutorial-toggle",
          onClick: () => {
            const next = !showTutorial;
            setShowTutorial(next);
            localStorage.setItem(TUTORIAL_KEY, next ? "0" : "1");
          },
        },
        showTutorial ? "Hide Tutorial" : "Show Tutorial",
      ),
    ),
    showTutorial
      ? h(
          "section",
          { className: "tutorial-card" },
          h("h2", null, "Tutorial"),
          h(
            "ol",
            null,
            h("li", null, "Watch the highlighted grid tile and listen to the spoken letter."),
            h("li", null, "Press Position key (default A) if the tile matches N rounds ago."),
            h("li", null, "Press Audio key (default L) if the spoken letter matches N rounds ago."),
            h("li", null, "You can press both keys if both matches are true."),
            h("li", null, "Green means correct detection. Red means miss or false positive."),
            h("li", null, "You need at least 70% to pass and unlock the next N level."),
          ),
          h("h3", null, "Example (Dual 3-back)"),
          h(
            "p",
            { className: "tutorial-example" },
            "Letters: A, C, B, D, E, B. At round 6, compare to round 3: both are B. Press Audio (L). If you press L, feedback is green; if not, red.",
          ),
          h(
            "p",
            { className: "tutorial-example" },
            "Positions: 2, 7, 4, 1, 5, 4. At round 6, compare to round 3: both are tile 4. Press Position (A). If you press A, feedback is green; if not, red.",
          ),
          h(
            "div",
            { className: "tutorial-actions" },
            h(
              "button",
              {
                onClick: () => {
                  setShowTutorial(false);
                  localStorage.setItem(TUTORIAL_KEY, "1");
                },
              },
              "Got it",
            ),
          ),
        )
      : null,
    h(
      "section",
      { className: "controls" },
      controlNumber("N level", "How many rounds back to compare (default starts at 3).", level, setLevel, 1, isRunning),
      controlNumber("Rounds", "How many stimuli in one session. More rounds gives more stable scoring.", rounds, setRounds, 6, isRunning),
      controlNumber("Stimulus ms", "How long each stimulus is shown, in milliseconds.", stimulusMs, setStimulusMs, 200, isRunning),
      controlNumber("Gap ms", "Delay between stimuli, in milliseconds.", gapMs, setGapMs, 100, isRunning),
      controlText("Position key", "Key used when current tile matches N-back tile (default A).", positionKey, setPositionKey, isRunning),
      controlText("Audio key", "Key used when spoken letter matches N-back letter (default L).", letterKey, setLetterKey, isRunning),
      h(
        "button",
        { id: "startBtn", onClick: startSession, disabled: isRunning },
        isRunning ? "Running..." : "Start Session",
      ),
    ),
    h("section", { className: "status" }, h("div", null, statusText), h("div", null, scoreText)),
    h(
      "section",
      { className: "arena" },
      h(
        "div",
        { className: "grid-wrap" },
        h(
          "div",
          { className: "grid", id: "grid" },
          ...Array.from({ length: 9 }, (_, idx) => {
            const pos = idx + 1;
            const active = activeStimulus && activeStimulus.position === pos;
            const feedbackClass =
              feedbackTile === pos && positionFeedback !== "neutral" ? ` feedback-${positionFeedback}` : "";
            return h("div", { key: pos, className: `cell${active ? " active" : ""}${feedbackClass}` });
          }),
        ),
        h(
          "div",
          { className: "press-row" },
          h(
            "div",
            { className: `press-pill state-${positionFeedback} ${pressedPosition ? "pressed" : ""}` },
            `Position (${positionKey.toUpperCase()}) - ${positionFeedback.toUpperCase()}`,
          ),
          h(
            "div",
            { className: `press-pill state-${letterFeedback} ${pressedAudio ? "pressed" : ""}` },
            `Audio (${letterKey.toUpperCase()}) - ${letterFeedback.toUpperCase()}`,
          ),
        ),
      ),
    ),
    h(
      "section",
      null,
      h("div", { className: "history-head" }, h("h2", null, "History"), h("button", { onClick: clearHistory, disabled: isRunning }, "Clear")),
      historyRows.length === 0
        ? h("div", null, "No sessions yet.")
        : h(
            "table",
            { className: "history-table" },
            h("thead", null, h("tr", null, h("th", null, "Time"), h("th", null, "Level"), h("th", null, "Score"), h("th", null, "Decisions"), h("th", null, "Result"))),
            h(
              "tbody",
              null,
              ...historyRows.map((row) =>
                h(
                  "tr",
                  { key: `${row.timestamp}-${row.level}` },
                  h("td", null, row.timestamp),
                  h("td", null, String(row.level)),
                  h("td", null, `${(row.score * 100).toFixed(1)}%`),
                  h("td", null, `${row.correctDecisions}/${row.totalDecisions}`),
                  h("td", { className: row.passed ? "pass" : "fail" }, row.passed ? "PASS" : "FAIL"),
                ),
              ),
            ),
          ),
    ),
  );
}

function controlNumber(label, tooltip, value, setter, min, disabled) {
  return h(
    "label",
    { title: tooltip },
    h("span", { className: "label-text" }, label),
    h("input", {
      type: "number",
      min,
      value,
      title: tooltip,
      disabled,
      onChange: (e) => setter(Number(e.target.value)),
    }),
  );
}

function controlText(label, tooltip, value, setter, disabled) {
  return h(
    "label",
    { title: tooltip },
    h("span", { className: "label-text" }, label),
    h("input", {
      value,
      maxLength: 1,
      title: tooltip,
      disabled,
      onChange: (e) => setter(e.target.value.toLowerCase()),
    }),
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App));
