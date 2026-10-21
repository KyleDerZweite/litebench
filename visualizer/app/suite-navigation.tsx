export type SuiteId = "copybench" | "naturalbench" | "cefrbench";

export const suites: { id: SuiteId; label: string }[] = [
  { id: "copybench", label: "CopyBench Lite" },
  { id: "naturalbench", label: "NaturalBench Lite" },
  { id: "cefrbench", label: "CEFRBench Lite" },
];

export default function SuiteNavigation({
  value,
  onChange,
}: {
  value: SuiteId;
  onChange: (value: SuiteId) => void;
}) {
  return (
    <nav aria-label="Writing suites" className="suite-navigation">
      {suites.map(({ id, label }) => (
        <button
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          key={id}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
