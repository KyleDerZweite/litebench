// Split only at quote boundaries, preserving all original text and overlapping findings.
export function evidenceSegments(output: string, quotes: string[]) {
  const matches: { start: number; end: number; issue: number }[] = [];
  quotes.forEach((quote, issue) => {
    if (!quote) return;
    for (let start = output.indexOf(quote); start !== -1; start = output.indexOf(quote, start + 1)) {
      matches.push({ start, end: start + quote.length, issue });
    }
  });
  const boundaries = [...new Set([0, output.length, ...matches.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => ({
    text: output.slice(start, boundaries[index + 1]),
    issues: [...new Set(matches.filter((match) => match.start <= start && match.end >= boundaries[index + 1]).map((match) => match.issue))],
  }));
}
