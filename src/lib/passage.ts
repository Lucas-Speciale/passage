import type { CorridorPoint } from "@/types/passage";

export function formatPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function chartPath(series: CorridorPoint[], width: number, height: number): string {
  if (!series.length) return "";
  const values = series.map((point) => point.dailyAverage);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 1);
  return series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
    const y = height - ((point.dailyAverage - low) / span) * height;
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
