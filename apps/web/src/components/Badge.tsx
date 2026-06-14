// apps/web/src/components/Badge.tsx
const TONES: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export default function Badge({ label, tone = "gray" }: { label: string; tone?: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${TONES[tone] ?? TONES.gray}`}
    >
      {label}
    </span>
  );
}
