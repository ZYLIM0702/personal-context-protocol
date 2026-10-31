export type Preset = { id: string; title: string; blurb: string; icon: "film" | "chef" | "hammer" | "spark"; signals: [string, string][] };

export const PRESETS: Preset[] = [
  {
    id: "indie",
    title: "Indie film & art-rock",
    blurb: "Moody, cinematic, thoughtful",
    icon: "film",
    signals: [
      ["Radiohead", "artist"],
      ["Arrival", "movie"],
      ["Spirited Away", "movie"],
      ["Portishead", "artist"],
      ["Norwegian Wood", "book"],
    ],
  },
  {
    id: "chef",
    title: "Home chef & slow living",
    blurb: "Calm, crafted, cozy",
    icon: "chef",
    signals: [
      ["Muji", "brand"],
      ["Blue Bottle Coffee", "brand"],
      ["Chef's Table", "tv_show"],
      ["Salt Fat Acid Heat", "book"],
      ["Norah Jones", "artist"],
    ],
  },
  {
    id: "maker",
    title: "Builder & maker",
    blurb: "Hands-on, curious, outdoorsy",
    icon: "hammer",
    signals: [
      ["Patagonia", "brand"],
      ["Mythbusters", "tv_show"],
      ["The Martian", "movie"],
      ["Daft Punk", "artist"],
      ["Atomic Habits", "book"],
    ],
  },
  {
    id: "pop",
    title: "Pop & night out",
    blurb: "Bright, social, on-trend",
    icon: "spark",
    signals: [
      ["Taylor Swift", "artist"],
      ["Dua Lipa", "artist"],
      ["Barbie", "movie"],
      ["Glossier", "brand"],
      ["The Bear", "tv_show"],
    ],
  },
];
