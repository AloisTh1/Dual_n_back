import assert from "node:assert/strict";

import {
  determineNextLevel,
  evaluateRoundFeedback,
  evaluateResponses,
  generateSequence,
  startLevelFromHistory,
} from "../web/gameLogic.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("generateSequence enforces n-back matches at probability 1", () => {
  const seq = generateSequence({ n: 2, rounds: 10, matchProbability: 1, seed: 1 });
  assert.equal(seq.length, 10);
  for (let i = 2; i < 10; i += 1) {
    assert.equal(seq[i].position, seq[i - 2].position);
    assert.equal(seq[i].letter, seq[i - 2].letter);
  }
});

run("generateSequence validates arguments", () => {
  assert.throws(() => generateSequence({ n: 0, rounds: 10 }));
  assert.throws(() => generateSequence({ n: 3, rounds: 3 }));
});

run("evaluateResponses computes decision accuracy", () => {
  const sequence = [
    { position: 1, letter: "A" },
    { position: 2, letter: "B" },
    { position: 1, letter: "C" },
    { position: 2, letter: "B" },
  ];
  const responses = [new Set(), new Set(), new Set(["v"]), new Set(["v", "a"])];
  const res = evaluateResponses({ sequence, responses, n: 2, positionKey: "v", letterKey: "a" });

  assert.equal(res.correctDecisions, 3);
  assert.equal(res.totalDecisions, 3);
  assert.equal(res.score, 1);
  assert.equal(res.passed, true);
  assert.equal(res.hits, 3);
  assert.equal(res.misses, 0);
  assert.equal(res.falsePositives, 0);
  assert.equal(res.correctRejections, 1);
  assert.equal(res.mistakes.length, 0);
  assert.ok(res.scientificScore > 0);
  assert.ok(res.modalities.position.dPrime > 0);
  assert.ok(res.modalities.audio.dPrime > 0);
});

run("evaluateResponses penalizes misses and false positives", () => {
  const sequence = [
    { position: 1, letter: "A" },
    { position: 2, letter: "B" },
    { position: 1, letter: "C" },
    { position: 2, letter: "D" },
  ];
  const responses = [new Set(), new Set(), new Set(["a"]), new Set(["v"])];
  const res = evaluateResponses({ sequence, responses, n: 2, positionKey: "v", letterKey: "a" });

  assert.equal(res.correctDecisions, 1);
  assert.equal(res.totalDecisions, 3);
  assert.equal(res.score, 1 / 3);
  assert.equal(res.passed, false);
  assert.equal(res.hits, 1);
  assert.equal(res.misses, 1);
  assert.equal(res.falsePositives, 1);
  assert.equal(res.correctRejections, 1);
  assert.equal(res.mistakes.length, 2);
  assert.deepEqual(
    res.mistakes.map((m) => `${m.stream}:${m.errorType}`),
    ["position:miss", "audio:false_positive"],
  );
  assert.ok(res.scientificScore < 2);
  assert.ok(res.modalities.position.hitRate >= 0 && res.modalities.position.hitRate <= 1);
  assert.ok(res.modalities.audio.falseAlarmRate >= 0 && res.modalities.audio.falseAlarmRate <= 1);
});

run("level progression requires at least 70%", () => {
  assert.equal(determineNextLevel(2, 0.7), 3);
  assert.equal(determineNextLevel(2, 0.69999), 2);
});

run("round feedback marks match hit as green and miss as red", () => {
  const sequence = [
    { position: 1, letter: "A" },
    { position: 2, letter: "B" },
    { position: 1, letter: "A" },
  ];
  const hit = [new Set(), new Set(), new Set(["a", "l"])];
  const miss = [new Set(), new Set(), new Set()];

  assert.deepEqual(
    evaluateRoundFeedback({
      sequence,
      responses: hit,
      n: 2,
      index: 2,
      positionKey: "a",
      letterKey: "l",
    }),
    { positionOutcome: "green", letterOutcome: "green" },
  );

  assert.deepEqual(
    evaluateRoundFeedback({
      sequence,
      responses: miss,
      n: 2,
      index: 2,
      positionKey: "a",
      letterKey: "l",
    }),
    { positionOutcome: "red", letterOutcome: "red" },
  );
});

run("round feedback marks false positive as red and no-signal as neutral", () => {
  const sequence = [
    { position: 1, letter: "A" },
    { position: 2, letter: "B" },
    { position: 3, letter: "C" },
  ];
  const fp = [new Set(), new Set(), new Set(["a"])];
  const neutral = [new Set(), new Set(), new Set()];

  assert.deepEqual(
    evaluateRoundFeedback({
      sequence,
      responses: fp,
      n: 2,
      index: 2,
      positionKey: "a",
      letterKey: "l",
    }),
    { positionOutcome: "red", letterOutcome: "neutral" },
  );

  assert.deepEqual(
    evaluateRoundFeedback({
      sequence,
      responses: neutral,
      n: 2,
      index: 1,
      positionKey: "a",
      letterKey: "l",
    }),
    { positionOutcome: "neutral", letterOutcome: "neutral" },
  );
});

run("startLevelFromHistory starts from highest passed + 1", () => {
  const history = [
    { level: 2, passed: true },
    { level: 3, passed: false },
    { level: 4, passed: true },
  ];
  assert.equal(startLevelFromHistory(history), 5);
  assert.equal(startLevelFromHistory([]), 3);
});

console.log("All tests passed.");
