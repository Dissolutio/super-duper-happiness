// ✏️  ALL THE WORDS ON THE PUBLIC ALLIANCE PAGE
// Edit freely. This file is only text: layout and code live elsewhere.
//
// 📏 HOW TO EDIT
//  ✅ Text goes inside "double quotes". Apostrophes are fine: "we're".
//  ✅ Long text is split into short pieces inside [ ], one per line.
//     The page joins the pieces with a space, so split anywhere
//     between words. Add or remove pieces freely.
//  ✅ Every piece ends with a comma, and so does every ] or "text".
//  ✅ **double stars** make bold. That is the only formatting.
//  🚫 No " inside a text (use ' or “ ” instead). No HTML: it shows
//     up as plain text on purpose.
//  🔤 Words in {curly braces} are filled in by the page. Keep them:
//     {tag}  the alliance being shown   {home}  our alliance (DONUT)
//     {name} a player                   {g}     a galaxy number
//     {members} / {planets}  counts (only in the subline)
//  💬 Lines starting with // are notes like this one. Ignored.
//
// 🧪 CHECK YOUR EDIT: open the page after saving. If it is blank or
//    stuck loading, a quote or comma is missing near your change.

const COPY = {
  // 🌐 BROWSER TAB AND SEARCH-ENGINE SNIPPET
  pageTitle: "{tag}, an OGame alliance",
  pageDescription: [
    "Where {home} lives in the OGame universe Jishui (USA).",
    "Orange planets are belong to us.",
  ],

  // 🔝 TOP OF THE PAGE
  headerLabel: "▲ SYSTEM MESSAGE",
  loading: "Mimic preparing...",
  loadFailed: "Could not load the game data. Try again in a minute.",
  subline: "{members} members, {planets} planets, universe Jishui (USA)",
  pickerLabel: "Looking at",

  // 📣 THE RECRUITING BOX
  // Always about our alliance, whichever alliance is picked.
  recruitLabel: "★ NEW QUEST AVAILABLE",
  recruitTitle: "Join the crawl",
  recruitBody: [
    "{home} is recruiting. Active players of any size, any class.",
    "We fly together, we hit together,",
    "and we keep each other's moons alive.",
  ],
  recruitHow: [
    "To accept: in the game open **Alliance**, search for **{home}**",
    "and send an application. Mention this page.",
    "Reward: friends, loot, and a 100% chance of drama.",
  ],

  // 🗺️ THE MAP
  allGalaxiesTab: "All",
  legendOthers: "everyone else",

  // 🏆 THE MEMBER LIST
  leaderboardTitle: "Crawler leaderboard",
  leaderboardNote: [
    "Every crawler currently in {tag}, by points.",
    "Tap one to find their planets.",
  ],

  // 👣 BOTTOM OF THE PAGE
  footer: [
    "Universe Jishui, USA.",
    "Built from the game's public data, refreshed daily.",
    "Not an official OGame site.",
    "The System is not responsible for your fleet.",
  ],

  // 💬 POP-UPS AT THE BOTTOM OF THE SCREEN
  systemLabel: "▲ SYSTEM MESSAGE",
  achievementLabel: "★ NEW ACHIEVEMENT",
  welcome: [
    "Welcome, crawler. Orange planets are {tag}.",
    "Everything else is merely scenery.",
  ],

  // 🏅 ACHIEVEMENTS: each one pops up once per visit
  achievements: {
    // 🍩 tapped one of our planets
    foundHome: [
      "Friendly Territory! You found a {home} planet.",
      "Reward: a warm feeling and absolutely no loot.",
    ],
    // 🔭 tapped a planet of the alliance picked at the top
    foundPicked: [
      "Recon! You found a {tag} planet.",
      "The System has made a note of it.",
    ],
    // 🧳 first tap on anybody else's planet
    firstOther: [
      "Tourist! You looked at someone else's planet.",
      "The System is mildly disappointed.",
    ],
    // 🪐 opened a galaxy ({g} is its number)
    galaxy: "Floor {g} unlocked. You may now gawk at galaxy {g}.",
    // 🧭 opened every galaxy
    allGalaxies: [
      "Cartographer! Every galaxy visited.",
      "Your prize box is in the mail. There is no mail.",
    ],
    // 🕵️ tapped a name in the member list
    foundMember: "Stalker, the friendly kind! You tracked down {name}.",
    // 🔍 picked another alliance at the top
    pickedOther: [
      "Spyglass! You are now peeking at {tag}.",
      "Bold. The System approves.",
    ],
  },

  // 🎲 RANDOM REMARKS when tapping planets outside the shown
  // alliance (after the first one). Add or remove remarks freely:
  // each remark is its own [ ... ], block.
  otherPlanetChance: 0.35, // 🎯 how often: 0 = never, 1 = every tap
  otherPlanetLines: [
    [
      "That planet is not one of theirs. The System has opinions",
      "about that, but is legally not allowed to share them.",
    ],
    [
      "Unaffiliated planet detected. Its owner could be",
      "in an alliance with good taste. Just saying.",
    ],
    [
      "Scanning... this crawler has no orange in their life. Tragic.",
    ],
  ],
}
