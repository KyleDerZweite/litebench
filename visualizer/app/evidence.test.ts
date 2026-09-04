import { strict as assert } from "node:assert";
import { evidenceSegments } from "./evidence";

const original = "<b>banana</b>\nbanana  ";
const segments = evidenceSegments(original, ["banana", "ana", "ana", "", "absent"]);
assert.equal(segments.map((segment) => segment.text).join(""), original);
assert(segments.some((segment) => segment.issues.join() === "0,1,2"));
assert(!segments.some((segment) => segment.issues.includes(3) || segment.issues.includes(4)));
assert.equal(evidenceSegments("plain", []).map((segment) => segment.text).join(""), "plain");
assert.deepEqual(evidenceSegments("", [""]), []);
assert.deepEqual(evidenceSegments("a a", ["a", "a"]), [
  { text: "a", issues: [0, 1] },
  { text: " ", issues: [] },
  { text: "a", issues: [0, 1] },
]);
assert(evidenceSegments("aaaa", ["aa"]).every((segment) => segment.issues.includes(0)));
