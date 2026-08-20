import { describe, expect, it } from "vitest";

import { chartPath, formatPeriod, seriesSummary } from "@/lib/passage";

describe("Passage helpers", () => {
  it("formats monthly periods", () => {
    expect(formatPeriod("2026-07")).toBe("July 2026");
  });

  it("summarizes a corridor against its pre-2023 baseline", () => {
    expect(seriesSummary([
      { period: "2019-01", dailyAverage: 10 },
      { period: "2020-01", dailyAverage: 20 },
      { period: "2026-01", dailyAverage: 12 },
    ])).toEqual({ latest: 12, baseline: 15, delta: -20 });
  });

  it("creates a finite chart path for a flat series", () => {
    expect(chartPath([{ period: "2026-01", dailyAverage: 4 }], 100, 40)).toBe("M50.0,40.0");
  });
});
