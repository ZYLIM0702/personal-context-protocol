---
name: personal-context
description: Personalize recommendations with the user's Personal Context PC (PCP). Use whenever you are about to recommend or shortlist movies, music or artists, books, TV shows, podcasts, places, brands or public figures, or when the user reacts to a recommendation or names a favorite.
---

# Personal Context

The `personal-context` MCP server holds the user's PC: public favorites, vetoes and a 2-weight model that trains on this machine.

1. **Before recommending**, draft 3 to 10 candidates of one type (`artist`, `book`, `brand`, `movie`, `person`, `place`, `podcast`, `tv_show`), each with your own `prior` probability, and call `pcp_rerank`.
2. **Present the list in the returned order.** Mention Qloo's affinity only when `qloo` is a number. If no option was scored (for example `qloo.status` is `error`), say taste scoring was unavailable and the order is your own, adjusted by the user's model. Never invent scores.
3. **Surface `qloo.unresolved`.** Retry an unresolved option with a more exact title; for an unresolved signal, suggest re-adding it with one of the listed candidates.
4. **On a reaction** ("I'll watch Arrival", "not Inception"), call `pcp_feedback` with `liked: true` or `false`. Only for the user's stated reactions.
5. **When the user names a favorite**, call `pcp_add_signal`. Public entities only, never personal data.
6. For "what do you share?" call `pcp_disclose`; for setup problems call `pcp_status`.
