export type DeckCard = { name: string; type: string; blurb: string; source?: "google" };

export const CATEGORIES: { type: string; label: string }[] = [
  { type: "artist", label: "Music" },
  { type: "movie", label: "Movies" },
  { type: "tv_show", label: "TV" },
  { type: "book", label: "Books" },
  { type: "podcast", label: "Podcasts" },
  { type: "place", label: "Places" },
  { type: "brand", label: "Brands" },
];

const CATALOG: Record<string, [string, string][]> = {
  artist: [
    ["Radiohead", "Art rock · Oxford"],
    ["Taylor Swift", "Pop · singer-songwriter"],
    ["Kendrick Lamar", "Hip-hop · Compton"],
    ["Billie Eilish", "Alt-pop · Los Angeles"],
    ["Daft Punk", "French house · electronic"],
    ["Frank Ocean", "R&B · alternative"],
    ["Fleetwood Mac", "Classic rock"],
    ["Bad Bunny", "Latin trap · reggaeton"],
  ],
  movie: [
    ["Arrival", "2016 · Denis Villeneuve"],
    ["Spirited Away", "2001 · Hayao Miyazaki"],
    ["Parasite", "2019 · Bong Joon-ho"],
    ["The Grand Budapest Hotel", "2014 · Wes Anderson"],
    ["Everything Everywhere All at Once", "2022 · Daniels"],
    ["La La Land", "2016 · Damien Chazelle"],
    ["Mad Max: Fury Road", "2015 · George Miller"],
    ["Inception", "2010 · Christopher Nolan"],
  ],
  tv_show: [
    ["Breaking Bad", "Crime drama · 5 seasons"],
    ["The Office", "Workplace comedy"],
    ["Succession", "Family drama · HBO"],
    ["Fleabag", "Comedy-drama · BBC"],
    ["Severance", "Sci-fi thriller · Apple TV+"],
    ["The Bear", "Kitchen drama · FX"],
    ["Stranger Things", "Sci-fi · Netflix"],
    ["Planet Earth", "Nature documentary · BBC"],
  ],
  book: [
    ["Dune", "Frank Herbert · sci-fi"],
    ["Normal People", "Sally Rooney · literary fiction"],
    ["Project Hail Mary", "Andy Weir · sci-fi"],
    ["Sapiens", "Yuval Noah Harari · history"],
    ["Pachinko", "Min Jin Lee · historical fiction"],
    ["Circe", "Madeline Miller · mythology"],
    ["The Midnight Library", "Matt Haig · fiction"],
    ["Nineteen Eighty-Four", "George Orwell · classic"],
  ],
  podcast: [
    ["The Daily", "News · The New York Times"],
    ["Radiolab", "Science · storytelling"],
    ["This American Life", "Storytelling · weekly"],
    ["Serial", "True crime · investigative"],
    ["Huberman Lab", "Health · neuroscience"],
    ["Freakonomics Radio", "Economics · curiosity"],
    ["Hardcore History", "History · long form"],
    ["Conan O'Brien Needs a Friend", "Comedy · interviews"],
  ],
  place: [
    ["Kyoto", "Japan · temples and gardens"],
    ["Lisbon", "Portugal · hills and tiles"],
    ["Central Park", "New York City"],
    ["Louvre Museum", "Paris · art"],
    ["Banff National Park", "Canada · mountains"],
    ["Tokyo", "Japan · city"],
    ["Barcelona", "Spain · architecture"],
    ["Santorini", "Greece · islands"],
  ],
  brand: [
    ["Patagonia", "Outdoor apparel"],
    ["Apple", "Consumer technology"],
    ["Nike", "Sportswear"],
    ["Muji", "Minimal home goods"],
    ["Lego", "Toys · building"],
    ["Aesop", "Skincare"],
    ["Uniqlo", "Everyday clothing"],
    ["Le Creuset", "Cookware"],
  ],
};

export const GOOGLE_DEMO: DeckCard[] = [
  ["Tame Impala", "artist", "Subscribed on YouTube"],
  ["Hot Ones", "tv_show", "Watched often on YouTube"],
  ["Phoebe Bridgers", "artist", "Liked on YouTube Music"],
  ["Tiny Desk Concerts", "tv_show", "Subscribed on YouTube"],
  ["Khruangbin", "artist", "Liked on YouTube Music"],
  ["Planet Earth II", "tv_show", "Watched on YouTube"],
  ["Hozier", "artist", "Liked on YouTube Music"],
  ["Arcane", "tv_show", "Trailer and clips watched"],
  ["Mitski", "artist", "Subscribed on YouTube"],
  ["The Last of Us", "tv_show", "Clips watched on YouTube"],
  ["Nujabes", "artist", "Liked on YouTube Music"],
  ["Shōgun", "tv_show", "Trailer watched on YouTube"],
].map(([name, type, blurb]) => ({ name, type, blurb, source: "google" as const }));

export function buildDeck(types: string[], google: boolean): DeckCard[] {
  const lists = types.map((t) => (CATALOG[t] ?? []).map(([name, blurb]) => ({ name, type: t, blurb })));
  const mixed: DeckCard[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
  const deck = google ? [...GOOGLE_DEMO, ...mixed] : mixed;
  const seen = new Set<string>();
  return deck.filter((c) => (seen.has(c.name.toLowerCase()) ? false : (seen.add(c.name.toLowerCase()), true)));
}
