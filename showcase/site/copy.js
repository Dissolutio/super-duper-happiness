// ALL THE WORDS ON THE PUBLIC ALLIANCE PAGE. Edit freely: this file is only text, the page's layout and code live elsewhere.
//
// Rules, so nothing breaks:
//  - Keep each text inside its quotes '...'. If you need an apostrophe inside, write it as \' (like: don\'t) or use ’ instead.
//  - Keep the commas at the end of lines, and the [ ] around lists.
//  - **double stars** make bold. That is the only formatting; HTML tags show up as plain text on purpose.
//  - Words in {curly braces} are filled in by the page, keep them as they are:
//      {tag} the alliance being shown   {home} our alliance (DONUT)   {name} a player   {n} a number   {g} a galaxy number
//  - Lines that start with // are notes like this one and are ignored.
// Check your edit: open the page, if it is blank or still says "Loading" forever, a quote or comma is missing.

const COPY = {
  // browser tab and search-engine snippet
  pageTitle: '{tag}, an OGame alliance',
  pageDescription: 'Where {home} lives in the OGame universe Jishui (USA). Orange planets are ours.',

  // top of the page
  headerLabel: '▲ SYSTEM MESSAGE',
  loading: 'Loading the universe...',
  loadFailed: 'Could not load the game data. Try again in a minute.',
  subline: '{members} members, {planets} planets, universe Jishui (USA)',
  pickerLabel: 'Looking at',

  // the recruiting box (always about our alliance, whichever alliance is picked)
  recruitLabel: '★ NEW QUEST AVAILABLE',
  recruitTitle: 'Join the crawl',
  recruitBody: '{home} is recruiting. Active players of any size, any class. We fly together, we hit together, and we keep each other\'s moons alive.',
  recruitHow: 'To accept: in the game open **Alliance**, search for **{home}** and send an application. Mention this page. Reward: friends, loot, and a 100% chance of drama.',

  // the map
  allGalaxiesTab: 'All',
  legendOthers: 'everyone else',

  // the member list
  leaderboardTitle: 'Crawler leaderboard',
  leaderboardNote: 'Every crawler currently in {tag}, by points. Tap one to find their planets.',

  footer: 'Universe Jishui, USA. Built from the game\'s public data, refreshed daily. Not an official OGame site. The System is not responsible for your fleet.',

  // pop-ups at the bottom of the screen
  systemLabel: '▲ SYSTEM MESSAGE',
  achievementLabel: '★ NEW ACHIEVEMENT',
  welcome: 'Welcome, crawler. Orange planets are {tag}. Everything else is merely scenery.',

  // achievements: each one pops up once per visit
  achievements: {
    foundHome: 'Friendly Territory! You found a {home} planet. Reward: a warm feeling and absolutely no loot.',
    foundPicked: 'Recon! You found a {tag} planet. The System has made a note of it.',
    firstOther: 'Tourist! You looked at someone else\'s planet. The System is mildly disappointed.',
    galaxy: 'Floor {g} unlocked. You may now gawk at galaxy {g}.',
    allGalaxies: 'Cartographer! Every galaxy visited. Your prize box is in the mail. There is no mail.',
    foundMember: 'Stalker, the friendly kind! You tracked down {name}.',
    pickedOther: 'Spyglass! You are now peeking at {tag}. Bold. The System approves.',
  },

  // random remarks when tapping planets outside the shown alliance (after the first one). Add or remove lines freely.
  otherPlanetChance: 0.35, // how often a remark shows: 0 = never, 1 = every tap
  otherPlanetLines: [
    'That planet is not one of theirs. The System has opinions about that, but is legally not allowed to share them.',
    'Unaffiliated planet detected. Its owner could be in an alliance with good taste. Just saying.',
    'Scanning... this crawler has no orange in their life. Tragic.',
  ],
}
