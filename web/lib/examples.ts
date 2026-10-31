import { lang } from "./program";
import type { MemoryItem, Turn } from "./types";

export type Example = { id: string; title: string; turns: Turn[] };

const program = (lines: string[]) => lines.join("\n");

const tracks = [
  { title: "Teardrop", artist: "Massive Attack", because: "Portishead", affinity: 0.86 },
  { title: "Hoppípolla", artist: "Sigur Rós", because: "Radiohead", affinity: 0.81 },
  { title: "Holocene", artist: "Bon Iver", because: "Radiohead", affinity: 0.78 },
  { title: "Archangel", artist: "Burial", because: "Portishead", affinity: 0.74 },
  { title: "Two Weeks", artist: "Grizzly Bear", because: "Radiohead", affinity: 0.72 },
  { title: "Cherry-coloured Funk", artist: "Cocteau Twins", because: "Portishead", affinity: 0.7 },
  { title: "Jóga", artist: "Björk", because: "Radiohead", affinity: 0.69 },
  { title: "Nightswimming", artist: "R.E.M.", because: "Radiohead", affinity: 0.66 },
];

const MUSIC = program([
  "root = Card([intro, list])",
  `intro = TextContent(${lang("Your music list for this week, built from your PC: mellow, cinematic and a little dark, like what you already love.")})`,
  `list = Playlist(${lang("This week’s list")}, ${lang(tracks)}, ${lang("Ordered on your device by your PC model. Swipe in Discover to tune it.")}, true)`,
]);

const DIY = program([
  "root = Card([intro, plan, materials, more, tip])",
  `intro = TextContent(${lang("Here’s a two-day plan for a 90 cm wide, 180 cm tall two-door cupboard: a plywood carcass with pocket screws and a finish that matches your taste.")})`,
  "plan = Tabs([sat, sun])",
  `sat = TabItem("saturday", "Saturday · carcass", [satSteps])`,
  "satSteps = Steps([s1, s2, s3, s4])",
  `s1 = StepsItem("Measure and mark", ${lang("Confirm 90 × 40 × 180 cm fits; check skirting boards and sockets.")})`,
  `s2 = StepsItem("Cut the panels", ${lang("Break down both plywood sheets from the cut list and label every part.")})`,
  `s3 = StepsItem("Assemble the box", ${lang("Pocket-screw top and bottom between the sides; check both diagonals match.")})`,
  `s4 = StepsItem("Shelves and back", ${lang("Set shelf pins at 45 cm spacing, then glue and pin the 6 mm back to square it.")})`,
  `sun = TabItem("sunday", "Sunday · doors and finish", [sunSteps])`,
  "sunSteps = Steps([u1, u2, u3, u4])",
  `u1 = StepsItem("Sand", ${lang("Sand every face to 180 grit and ease all edges.")})`,
  `u2 = StepsItem("Finish", ${lang("Two thin coats of matte water-based lacquer, two hours apart.")})`,
  `u3 = StepsItem("Hang the doors", ${lang("Fit soft-close concealed hinges 10 cm from top and bottom; set 3 mm gaps.")})`,
  `u4 = StepsItem("Anchor it", ${lang("Screw it to a wall stud with an anti-tip bracket.")})`,
  `materials = Checklist("Materials", ${lang([
    { label: "Birch plywood 18 mm, 244 × 122 cm", qty: "2 sheets" },
    { label: "Birch plywood 6 mm (back panel)", qty: "1 sheet" },
    { label: "Concealed soft-close hinges", qty: "4" },
    { label: "Pocket screws 32 mm", qty: "1 box" },
    { label: "Shelf pins 5 mm", qty: "12" },
    { label: "Wood glue", qty: "1 bottle" },
    { label: "Matte water-based lacquer", qty: "1 L" },
    { label: "Anti-tip wall bracket", qty: "1" },
  ])})`,
  "more = SectionBlock([toolsSec, cutSec], false)",
  `toolsSec = SectionItem("tools", "Tools", [tools])`,
  `tools = TagBlock(${lang(["Track or circular saw", "Drill-driver", "Pocket-hole jig", "35 mm Forstner bit", "Clamps", "Square and tape", "Orbital sander"])})`,
  `cutSec = SectionItem("cuts", "Cut list", [cuts])`,
  "cuts = Table([cPart, cSize, cQty])",
  `cPart = Col("Part", ${lang(["Sides", "Top and bottom", "Shelves", "Doors", "Back panel"])})`,
  `cSize = Col("Size (cm)", ${lang(["180 × 40", "86.4 × 40", "86.0 × 38", "89.4 × 44.6", "180 × 90"])})`,
  `cQty = Col("Qty", [2, 2, 3, 2, 1], "number")`,
  `tip = Callout("info", "Style tip from your PC", ${lang("Since you love Muji: pale birch plywood, flush pulls, no visible hardware.")})`,
]);

const COOK = program([
  "root = Card([intro, tags, recipe])",
  `intro = TextContent(${lang("Something warm and quick for tonight, ready in about 25 minutes.")})`,
  `tags = TagBlock(${lang(["Japanese", "One pan", "Weeknight"])})`,
  `recipe = Recipe(${lang("Oyakodon (chicken and egg rice bowl)")}, "25 min", 2, ${lang([
    { item: "Boneless chicken thighs", qty: "300 g" },
    { item: "Eggs", qty: "3" },
    { item: "Onion", qty: "1 small" },
    { item: "Dashi stock", qty: "180 ml" },
    { item: "Soy sauce", qty: "2 tbsp" },
    { item: "Mirin", qty: "2 tbsp" },
    { item: "Sugar", qty: "1 tsp" },
    { item: "Cooked short-grain rice", qty: "2 bowls" },
    { item: "Spring onion", qty: "to finish" },
  ])}, ${lang([
    "Slice the onion thinly; cut the chicken into bite-size pieces.",
    "Simmer dashi, soy sauce, mirin and sugar in a small pan, add the onion and cook 3 minutes.",
    "Add the chicken and simmer 6 to 7 minutes until cooked through.",
    "Pour in the lightly beaten eggs, cover, and cook 1 minute until just set.",
    "Slide over hot rice and finish with spring onion.",
  ])}, ${lang("Since you love Spirited Away: a cozy Japanese home-style dish.")}, ${lang(["Miso-glazed salmon", "Vegetable katsu curry"])})`,
]);

const MEMORY = program([
  "root = Card([intro, recipe])",
  `intro = TextContent(${lang("A gentle, homely dinner for tonight: slow-simmered nikujaga, the comfort food of quiet family kitchens.")})`,
  `recipe = Recipe(${lang("Nikujaga (simmered beef and potatoes)")}, "40 min", 3, ${lang([
    { item: "Thinly sliced beef", qty: "250 g" },
    { item: "Potatoes", qty: "3 medium" },
    { item: "Carrot", qty: "1" },
    { item: "Onion", qty: "1" },
    { item: "Dashi stock", qty: "300 ml" },
    { item: "Soy sauce", qty: "3 tbsp" },
    { item: "Mirin", qty: "2 tbsp" },
    { item: "Sugar", qty: "1 tbsp" },
    { item: "Snow peas", qty: "a handful" },
  ])}, ${lang([
    "Cut potatoes and carrot into chunks; slice the onion into wedges.",
    "Brown the beef briefly in a little oil, then add the vegetables.",
    "Pour in dashi, soy sauce, mirin and sugar; bring to a simmer.",
    "Cover with a drop lid and simmer 20 minutes until the potatoes are tender.",
    "Add the snow peas for the last 2 minutes and serve with rice.",
  ])}, ${lang("Since you love Spirited Away: soft, homely Japanese comfort food.")}, ${lang(["Tamagoyaki", "Kitsune udon"])})`,
]);

const turn = (user: string, text: string): Turn[] => [
  { role: "user", text: user },
  { role: "assistant", text, format: "openui-lang", example: true },
];

export const EXAMPLES: Example[] = [
  { id: "example-music", title: "Get me my music list", turns: turn("Get me my music list", MUSIC) },
  { id: "example-diy", title: "Help me build a DIY cupboard this weekend", turns: turn("Help me build a DIY cupboard this weekend", DIY) },
  { id: "example-cook", title: "What should I cook today?", turns: turn("What should I cook today?", COOK) },
  {
    id: "example-memory",
    title: "I love Spirited Away… what should I cook?",
    turns: turn("I love Spirited Away but I can't stand Transformers. What should I cook tonight?", MEMORY),
  },
];

export const EXAMPLE_MEMORY: MemoryItem[] = [
  { name: "Spirited Away", type: "movie", liked: true, source: "chat", evidence: "I love Spirited Away", verified: true, at: "" },
  { name: "Transformers", type: "movie", liked: false, source: "chat", evidence: "I can't stand Transformers", verified: true, at: "" },
];

export const SHOWCASE_PROGRAM = COOK;
