import { strict as assert } from "node:assert";
import { BASE_RATING, computeStandings, expectedScore, updatedRatings } from "./elo";

assert.equal(expectedScore(1000, 1000), 0.5);
assert(expectedScore(1200, 1000) > 0.75 && expectedScore(1200, 1000) < 0.77);

const [winner, loser] = updatedRatings(1000, 1000, 1);
assert(winner > 1000 && loser < 1000);
assert(Math.abs(winner + loser - 2000) < 1e-9);

const [tieA, tieB] = updatedRatings(1000, 1000, 0.5);
assert.equal(tieA, 1000);
assert.equal(tieB, 1000);

const underdog = updatedRatings(800, 1200, 1);
assert(underdog[0] - 800 > winner - 1000);

const standings = computeStandings(["m [low]", "m [high]"], [
  { suite: "copybench", taskId: "t1", a: "m [low]", b: "m [high]", winner: "a", ts: "2026-09-11T00:00:00Z" },
  { suite: "copybench", taskId: "t1", a: "m [low]", b: "m [high]", winner: "tie", ts: "2026-09-11T00:01:00Z" },
  { suite: "copybench", taskId: "t1", a: "m [low]", b: "m [low]", winner: "a", ts: "2026-09-11T00:02:00Z" },
]);
assert.equal(standings[0].config, "m [low]");
assert.equal(standings[0].votes, 2);
assert.equal(standings[0].wins, 1);
assert.equal(standings[0].ties, 1);
assert.equal(standings[1].losses, 1);

assert.deepEqual(computeStandings(["m [low]"], []), [
  { config: "m [low]", rating: BASE_RATING, votes: 0, wins: 0, losses: 0, ties: 0 },
]);

console.log("elo.test: OK, expected scores, updates, ties, replays");
