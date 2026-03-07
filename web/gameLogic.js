export const PASS_THRESHOLD = 0.7;
export const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"];

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

// Acklam inverse-normal approximation used to compute d' via z-scores.
function normInv(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function sdtFromCounts({ hits, misses, falsePositives, correctRejections }) {
  const signalTrials = hits + misses;
  const noiseTrials = falsePositives + correctRejections;
  const adjustedHitRate = (hits + 0.5) / (signalTrials + 1);
  const adjustedFalseAlarmRate = (falsePositives + 0.5) / (noiseTrials + 1);

  return {
    hitRate: signalTrials === 0 ? 0 : hits / signalTrials,
    falseAlarmRate: noiseTrials === 0 ? 0 : falsePositives / noiseTrials,
    dPrime: normInv(adjustedHitRate) - normInv(adjustedFalseAlarmRate),
  };
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
  let hits = 0;
  let misses = 0;
  let falsePositives = 0;
  let correctRejections = 0;

  let positionHits = 0;
  let positionMisses = 0;
  let positionFalsePositives = 0;
  let positionCorrectRejections = 0;

  let audioHits = 0;
  let audioMisses = 0;
  let audioFalsePositives = 0;
  let audioCorrectRejections = 0;

  const mistakes = [];

  for (let i = n; i < sequence.length; i += 1) {
    const posExpected = sequence[i].position === sequence[i - n].position;
    const letExpected = sequence[i].letter === sequence[i - n].letter;

    const posPressed = responses[i].has(positionKey);
    const letPressed = responses[i].has(letterKey);

    if (posExpected && posPressed) {
      hits += 1;
      positionHits += 1;
    }
    if (posExpected && !posPressed) {
      misses += 1;
      positionMisses += 1;
      mistakes.push({
        round: i + 1,
        stream: "position",
        errorType: "miss",
        current: sequence[i].position,
        nBack: sequence[i - n].position,
        key: positionKey,
      });
    }
    if (!posExpected && posPressed) {
      falsePositives += 1;
      positionFalsePositives += 1;
      mistakes.push({
        round: i + 1,
        stream: "position",
        errorType: "false_positive",
        current: sequence[i].position,
        nBack: sequence[i - n].position,
        key: positionKey,
      });
    }
    if (!posExpected && !posPressed) {
      correctRejections += 1;
      positionCorrectRejections += 1;
    }

    if (letExpected && letPressed) {
      hits += 1;
      audioHits += 1;
    }
    if (letExpected && !letPressed) {
      misses += 1;
      audioMisses += 1;
      mistakes.push({
        round: i + 1,
        stream: "audio",
        errorType: "miss",
        current: sequence[i].letter,
        nBack: sequence[i - n].letter,
        key: letterKey,
      });
    }
    if (!letExpected && letPressed) {
      falsePositives += 1;
      audioFalsePositives += 1;
      mistakes.push({
        round: i + 1,
        stream: "audio",
        errorType: "false_positive",
        current: sequence[i].letter,
        nBack: sequence[i - n].letter,
        key: letterKey,
      });
    }
    if (!letExpected && !letPressed) {
      correctRejections += 1;
      audioCorrectRejections += 1;
    }

    // Scoring policy: only count actions that matter.
    // - Hit: +1
    // - Miss: contributes to denominator only
    // - False positive: contributes to denominator only
    // Correct rejections do not change numerator or denominator.
    if (posExpected && posPressed) {
      correctDecisions += 1;
      totalDecisions += 1;
    } else if (posExpected && !posPressed) {
      totalDecisions += 1;
    } else if (!posExpected && posPressed) {
      totalDecisions += 1;
    }

    if (letExpected && letPressed) {
      correctDecisions += 1;
      totalDecisions += 1;
    } else if (letExpected && !letPressed) {
      totalDecisions += 1;
    } else if (!letExpected && letPressed) {
      totalDecisions += 1;
    }
  }

  const score = totalDecisions === 0 ? 0 : correctDecisions / totalDecisions;
  const positionSdt = sdtFromCounts({
    hits: positionHits,
    misses: positionMisses,
    falsePositives: positionFalsePositives,
    correctRejections: positionCorrectRejections,
  });
  const audioSdt = sdtFromCounts({
    hits: audioHits,
    misses: audioMisses,
    falsePositives: audioFalsePositives,
    correctRejections: audioCorrectRejections,
  });
  const scientificScore = (positionSdt.dPrime + audioSdt.dPrime) / 2;

  return {
    score,
    correctDecisions,
    totalDecisions,
    hits,
    misses,
    falsePositives,
    correctRejections,
    mistakes,
    scientificScore,
    modalities: {
      position: {
        hits: positionHits,
        misses: positionMisses,
        falsePositives: positionFalsePositives,
        correctRejections: positionCorrectRejections,
        ...positionSdt,
      },
      audio: {
        hits: audioHits,
        misses: audioMisses,
        falsePositives: audioFalsePositives,
        correctRejections: audioCorrectRejections,
        ...audioSdt,
      },
    },
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
  return passed.length ? Math.max(...passed) + 1 : 3;
}
