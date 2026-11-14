// The HUB's game registry.
//
// Every playable game is one entry in GAMES. Today this list is hard-coded;
// when sign-ins arrive, Owners and Admins will add entries from inside the
// HUB and this file becomes the built-in starter list.
//
//   id          short unique slug, used in share links (#play=<id>)
//   title       name shown on the card and in the player bar
//   url         address of the HTML game to embed
//   description one or two sentences for the card
//   tags        up to three short labels
//   art         card artwork: 'taco' | 'city' | 'blocks' | 'dice' (anything else
//               falls back to the game's first letter on its accent colour)
//   accent      colour used by the fallback artwork

export const GAMES = [
  {
    id: 'tacocraft',
    title: 'Tacocraft',
    url: 'https://sefrenethofficial.github.io/Tacocraft/',
    description: 'Terraria but Minecraft but tacos.',
    tags: ['Sandbox', 'Crafting', 'Tacos'],
    art: 'taco',
    accent: '#FF9F1C',
  },
  {
    id: 'physick',
    title: 'Physick',
    url: 'https://sefrenethofficial.github.io/Physick/',
    description: 'Survive in an epick GTA-like city.',
    tags: ['Open world', 'City', '3D'],
    art: 'city',
    accent: '#3A86FF',
  },
  {
    id: 'casinoatrocity',
    title: 'Casinoatrocity',
    url: 'https://sefrenethofficial.github.io/Casinoatrocity/',
    description: 'Ride the elevator down into an eerie old hotel and try to stay alive. PS1-style shooter.',
    tags: ['FPS', 'Horror', 'Retro'],
    art: 'dice',
    accent: '#C1121F',
  },
];

// Ranks planned for the sign-in system. Only used for display right now.
export const RANKS = [
  { id: 'owner', title: 'Owner', blurb: 'Runs the HUB. Adds games, hands out ranks.', color: '#CC0000' },
  { id: 'admin', title: 'Admin', blurb: 'Adds and manages HTML games.', color: '#0000CC' },
  { id: 'player', title: 'Player', blurb: 'Plays everything, keeps a profile.', color: '#007A00' },
];
