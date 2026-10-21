"use client";

import { useState } from "react";
import ArenaView from "../arena";
import SuiteNavigation, { SuiteId } from "../suite-navigation";

export default function ScorePage() {
  const [suiteId, setSuiteId] = useState<SuiteId>("copybench");
  return (
    <main className="reading-page" id="main-content">
      <SuiteNavigation value={suiteId} onChange={setSuiteId} />
      <div className="page-intro">
        <p className="eyebrow">Your preferences · local votes</p>
        <h1>Which answer would you choose?</h1>
        <p>
          Compare two unedited answers without seeing the model names. Vote to
          reveal them and build your own rankings. Votes stay in this browser.
        </p>
      </div>
      <ArenaView key={suiteId} suiteId={suiteId} />
    </main>
  );
}
