export type StorySide = "left" | "right";

export interface PassageStory {
  id: string;
  period: string;
  category: string;
  title: string;
  body: string;
  note?: string;
  source: string;
  lon: number;
  lat: number;
  side: StorySide;
}

export const PASSAGE_STORIES: PassageStory[] = [
  {
    id: "guarded-lane",
    period: "2012-03",
    category: "Pattern",
    title: "The guarded lane",
    body: "Ships converge into disciplined parallel tracks through the Gulf of Aden, following a recommended security corridor through waters shaped by piracy risk.",
    source: "International Maritime Organization",
    lon: 48.2,
    lat: 12.7,
    side: "left",
  },
  {
    id: "arctic-window",
    period: "2013-09",
    category: "Seasonal route",
    title: "The Arctic window",
    body: "For a brief period each summer, a thin shipping route emerges along Russia’s Arctic coast. The 2013 navigation season brought record activity to the Northern Sea Route.",
    source: "Arctic Council",
    lon: 92,
    lat: 73,
    side: "left",
  },
  {
    id: "new-suez",
    period: "2015-08",
    category: "Infrastructure",
    title: "Suez adds another channel",
    body: "A new parallel waterway opens along part of the canal, expanding two-way navigation and reducing the time ships spend waiting to transit.",
    source: "Suez Canal Authority",
    lon: 32.48,
    lat: 30.35,
    side: "right",
  },
  {
    id: "expanded-panama",
    period: "2016-06",
    category: "Infrastructure",
    title: "Panama makes room",
    body: "The expanded canal opens to commercial traffic. Larger locks allow NeoPanamax vessels—and new categories such as large LNG carriers—to cross the isthmus.",
    source: "Panama Canal Authority",
    lon: -79.68,
    lat: 9.08,
    side: "right",
  },
  {
    id: "siberian-rivers",
    period: "2018-08",
    category: "Seasonal pattern",
    title: "The rivers wake",
    body: "Summer vessel activity becomes visible along Siberia’s Ob, Yenisey, and Lena rivers. The lines fade during freeze-up and return as navigable water reopens.",
    note: "Earlier river activity may be underrepresented by AIS coverage.",
    source: "Global Fishing Watch · Arctic river-ice research",
    lon: 88,
    lat: 65,
    side: "left",
  },
  {
    id: "ever-given",
    period: "2021-03",
    category: "Disruption",
    title: "A week at Suez",
    body: "Ever Given blocks the canal. Passage records 39.7 tracked daily passages in February, 34.0 in March, and 43.9 after traffic resumes in April.",
    source: "UNCTAD · IMF PortWatch",
    lon: 32.55,
    lat: 30,
    side: "right",
  },
  {
    id: "black-sea-grain",
    period: "2022-08",
    category: "Humanitarian corridor",
    title: "A protected lane reopens",
    body: "The Black Sea Grain Initiative establishes a monitored maritime corridor from Odesa, Chornomorsk, and Pivdennyi, returning commercial voyages to routes disrupted by war.",
    source: "United Nations",
    lon: 31.2,
    lat: 44.2,
    side: "right",
  },
  {
    id: "panama-drought",
    period: "2023-11",
    category: "Climate disruption",
    title: "Water becomes the constraint",
    body: "Severe drought lowers Panama’s reservoirs and forces restrictions. Tracked daily passages fall from 17.8 in October to 13.6 in November and 11.2 by January.",
    source: "Panama Canal Authority · IMF PortWatch",
    lon: -79.68,
    lat: 9.08,
    side: "right",
  },
  {
    id: "red-sea-reroute",
    period: "2024-01",
    category: "Rerouting",
    title: "The long way around",
    body: "Conflict pushes ships away from Bab el-Mandeb and toward southern Africa. Passage counts fall at the strait while rising sharply around the Cape.",
    note: "Bab el-Mandeb 50.8 → 25.5 · Cape 39.3 → 56.3 daily passages",
    source: "UNCTAD · IMF PortWatch",
    lon: 18.48,
    lat: -34.35,
    side: "right",
  },
  {
    id: "hormuz-conflict",
    period: "2026-03",
    category: "Current disruption",
    title: "Traffic falls at Hormuz",
    body: "Conflict and navigational danger sharply reduce normal commercial movement through the strait. Tracked daily passages fall from 30.5 in February to 2.0 in March.",
    note: "Activity remains heavily suppressed through the latest observations.",
    source: "International Maritime Organization · IMF PortWatch",
    lon: 56.35,
    lat: 26.55,
    side: "left",
  },
];

export function storyForPeriod(period: string) {
  return PASSAGE_STORIES.find((story) => story.period === period);
}
