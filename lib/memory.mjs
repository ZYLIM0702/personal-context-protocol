const END = String.raw`(?=[.!?;]|,\s*(?:but|because|since|so|and\s+i|i)\b|\s+(?:but|because|since|so|though|although|which|lately|recently|these days|right now|a lot|so much)\b|\s+and\s+(?:i|i'm|im|my|we|what|how|can|could|please)\b|$)`;

const POSITIVE = [
  String.raw`i\s+(?:really\s+|absolutely\s+|totally\s+|just\s+)?(?:love|loved|like|liked|enjoy|enjoyed|adore|adored|dig)`,
  String.raw`i(?:'?m|\s+am)\s+(?:such\s+)?(?:a\s+)?(?:big\s+|huge\s+|massive\s+)?fan\s+of`,
  String.raw`(?:big|huge)\s+fan\s+of`,
  String.raw`(?:i'?m\s+)?obsessed\s+with`,
  String.raw`(?:i'?ve\s+been|i\s+have\s+been|i\s+keep)\s+(?:listening\s+to|watching|reading|playing)`,
  String.raw`can'?t\s+stop\s+(?:listening\s+to|watching|reading)`,
  String.raw`my\s+(?:all[-\s]time\s+)?favou?rite(?:\s+\w+)?\s+(?:is|are)`,
];

const NEGATIVE = [
  String.raw`i\s+(?:really\s+|absolutely\s+)?(?:hate|hated|dislike|disliked|loathe)`,
  String.raw`i\s+(?:can'?t|cannot)\s+stand`,
  String.raw`i\s+(?:do\s*not|don'?t|didn'?t|never)\s+(?:really\s+)?(?:like|enjoy|want|care\s+for)`,
  String.raw`(?:i'?m\s+)?not\s+(?:a\s+|really\s+a\s+)?(?:big\s+)?fan\s+of`,
  String.raw`(?:i'?m\s+)?(?:tired|sick)\s+of`,
  String.raw`no\s+more`,
];

const GENERIC = new Set(
  "it that this them those these something anything everything stuff things music songs movies films shows books podcasts food cooking it all you him her".split(" "),
);

const compile = (cues) => new RegExp(String.raw`\b(?:${cues.join("|")})\s+(.+?)${END}`, "gi");
const POSITIVE_RE = compile(POSITIVE);
const NEGATIVE_RE = compile(NEGATIVE);

function clean(raw) {
  let text = String(raw).trim().replace(/^["“'‘]|["”'’]$/g, "");
  text = text.replace(/^(?:the\s+(?=(?:movie|film|show|series|band|book|album|podcast)\b))/i, "");
  text = text.replace(/^(?:the\s+)?(?:movie|film|show|series|band|singer|artist|book|novel|album|podcast|brand|restaurant)\s+/i, "");
  text = text.replace(/\s+(?:too|as well|anymore|any more|lol)$/i, "").trim();
  text = text.replace(/\s+(?:style|vibes?|aesthetic|stuff|music|songs|movies|films|books|shows|food)$/i, "").trim();
  return text;
}

function looksLikeEntity(text) {
  if (text.length < 2 || text.length > 60) return false;
  if (GENERIC.has(text.toLowerCase())) return false;
  if (text.split(/\s+/).length > 6) return false;
  return /[A-Z0-9]/.test(text[0]) || /^["“']/.test(text);
}

export function extractPreferences(message) {
  const text = String(message ?? "").slice(0, 2000);
  const found = new Map();
  for (const [re, liked] of [[POSITIVE_RE, true], [NEGATIVE_RE, false]]) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      for (const part of match[1].split(/\s*(?:,|\s&\s|\s+and\s+|\s+or\s+)\s*/)) {
        const name = clean(part);
        if (!looksLikeEntity(name)) continue;
        found.set(name.toLowerCase(), { name, liked, evidence: match[0].trim().slice(0, 140) });
      }
    }
  }
  return [...found.values()];
}

export function mentionsOf(message, names) {
  const text = ` ${String(message ?? "").toLowerCase()} `;
  return listUnique(names).filter((name) => {
    const n = String(name).toLowerCase().trim();
    return n.length > 2 && text.includes(n);
  });
}

const listUnique = (names) => [...new Set((Array.isArray(names) ? names : []).map(String))].slice(0, 20);
