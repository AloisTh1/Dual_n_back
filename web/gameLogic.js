export const PASS_THRESHOLD = 0.7;
export const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

function lcg(seed) {
  let state = (seed ?? Date.now()) >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickDifferent(pool, forbidden, rnd) {
  const filtered = pool.filter((x) => x !== forbidden);
  const idx = Math.floor(rnd() * filtered.length);
  return filtered[idx];
}

export function generateSequence({ n, rounds, matchProbability = 0.3, seed }) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be >= 1");
  if (!Number.isInteger(rounds) || rounds <= n) throw new Error("rounds must be > n");
  if (matchProbability < 0 || matchProbability > 1) throw new Error("matchProbability must be in [0,1]");

  const rnd = lcg(seed);
  const seq = [];
  for (let i = 0; i < rounds; i += 1) {
    if (i < n) {
      seq.push({
        position: POSITIONS[Math.floor(rnd() * POSITIONS.length)],
        letter: LETTERS[Math.floor(rnd() * LETTERS.length)],
      });
      continue;
    }

    const posMatch = rnd() < matchProbability;
    const letMatch = rnd() < matchProbability;

    const position = posMatch
      ? seq[i - n].position
      : pickDifferent(POSITIONS, seq[i - n].position, rnd);

    const letter = letMatch
      ? seq[i - n].letter
      : pickDifferent(LETTERS, seq[i - n].letter, rnd);

    seq.push({ position, letter });
  }

  return seq;
}

export function evaluateResponses({ sequence, responses, n, positionKey, letterKey }) {
  if (sequence.length !== responses.length) throw new Error("sequence/responses length mismatch");
  if (!positionKey || !letterKey || positionKey === letterKey) throw new Error("invalid key bindings");

  let correctDecisions = 0;
  let totalDecisions = 0;

  for (let i = n; i < sequence.length; i += 1) {
    const posExpected = sequence[i].position === sequence[i - n].position;
    const letExpected = sequence[i].letter === sequence[i - n].letter;

    const posPressed = responses[i].has(positionKey);
    const letPressed = responses[i].has(letterKey);

    correctDecisions += Number(posExpected === posPressed);
    correctDecisions += Number(letExpected === letPressed);
    totalDecisions += 2;
  }

  const score = totalDecisions === 0 ? 0 : correctDecisions / totalDecisions;
  return {
    score,
    correctDecisions,
    totalDecisions,
    passed: score >= PASS_THRESHOLD,
  };
}

export function evaluateRoundFeedback({ sequence, responses, n, index, positionKey, letterKey }) {
  if (index < n) {
    return { positionOutcome: "neutral", letterOutcome: "neutral" };
  }

  const posExpected = sequence[index].position === sequence[index - n].position;
  const letExpected = sequence[index].letter === sequence[index - n].letter;
  const posPressed = responses[index].has(positionKey);
  const letPressed = responses[index].has(letterKey);

  const positionOutcome = posExpected ? (posPressed ? "green" : "red") : (posPressed ? "red" : "neutral");
  const letterOutcome = letExpected ? (letPressed ? "green" : "red") : (letPressed ? "red" : "neutral");

  return { positionOutcome, letterOutcome };
}

export function determineNextLevel(currentLevel, score) {
  if (!Number.isInteger(currentLevel) || currentLevel < 1) throw new Error("invalid level");
  return score >= PASS_THRESHOLD ? currentLevel + 1 : currentLevel;
}

export function startLevelFromHistory(history) {
  const passed = history.filter((h) => h.passed).map((h) => h.level);
  return passed.length ? Math.max(...passed) + 1 : 2;
}
