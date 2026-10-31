"use client";

import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { Checklist, Playlist, Recipe } from "./AgentKit";
import { PickList } from "./PickList";

const slot = ["Card.children"];

export const library = openuiChatLibrary.extend({
  components: {
    add: [
      { component: PickList, slots: slot },
      { component: Playlist, slots: slot },
      { component: Recipe, slots: slot },
      { component: Checklist, slots: [...slot, "TabItem.content", "SectionItem.content"] },
    ],
  },
});

const INTERACTIVE_OR_HEAVY = [
  "CompositeCardBlock",
  "CompositeCardItem",
  "FollowUpBlock",
  "FollowUpItem",
  "Buttons",
  "Button",
  "IconButton",
  "EditableTable",
  "ScatterChart",
  "ScatterSeries",
  "Point",
  "RadarChart",
  "RadialChart",
  "SingleStackedBarChart",
  "AreaChart",
  "LineChart",
  "PieChart",
  "Slice",
  "Form",
  "FormControl",
  "Label",
  "Input",
  "TextArea",
  "Select",
  "SelectItem",
  "DatePicker",
  "Slider",
  "CheckBoxGroup",
  "CheckBoxItem",
  "RadioGroup",
  "RadioItem",
  "SwitchGroup",
  "SwitchItem",
  "Chips",
  "ChipItem",
  "OptionCards",
  "OptionCard",
  "ImageGallery",
  "ImageBlock",
  "VisualCardBlock",
  "VisualCardItem",
  "ImageTextLarge",
  "CodeBlock",
  "Carousel",
  "PickList",
];

export const promptLibrary = library.extend({ components: { remove: INTERACTIVE_OR_HEAVY } });

const RULES = [
  "You are the user's personal agent: music, films, books, cooking, DIY projects, travel and everyday tasks.",
  "Answers are read-only. Never use buttons, forms, follow-up suggestions, clickable list items or any selection control.",
  "Keep it to one Card: a one or two sentence TextContent intro, then 1 to 4 rich components.",
  "Use Playlist for music lists, Recipe for cooking, Steps plus Table plus Checklist for projects, and Tabs to split days or phases.",
  "Only show Qloo affinity numbers that come from pcp_recommend results. Never invent scores.",
  "Tie one short note to the user's Personal Context when it genuinely fits (for example: Since you love Muji: pale birch plywood).",
];

const EXAMPLE = [
  'root = Card([intro, recipe])',
  'intro = TextContent("A cozy dinner for tonight, matched to your taste.")',
  'recipe = Recipe("Oyakodon", "25 min", 2, [{item: "Chicken thighs", qty: "300 g"}, {item: "Eggs", qty: "3"}], ["Simmer the sauce.", "Add chicken, then egg."], "Since you love Spirited Away: cozy Japanese home cooking.", ["Miso salmon"])',
].join("\n");

let cached: string | null = null;

export function uiPrompt() {
  if (!cached) cached = promptLibrary.prompt({ additionalRules: RULES, examples: [EXAMPLE] });
  return cached;
}

export const LIBRARY_STATS = () => ({
  components: Object.keys(library.components).length,
  promptComponents: Object.keys(promptLibrary.components).length,
  promptChars: uiPrompt().length,
});
