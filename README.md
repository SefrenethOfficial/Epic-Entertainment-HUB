# Epic Entertainment HUB

A social gaming hub for Sefreneth's browser games — a branch of Epic Entertainment LLC.
The whole site interface (nav bar, logo, game cards, community panel) is drawn in three.js.

## Run it

It is a static site with no build step. Serve the folder with any web server:

```
python3 -m http.server 8000
```

then open http://localhost:8000. On GitHub, turn on Pages for the `main` branch (Settings → Pages) and it will be live at
`https://sefrenethofficial.github.io/Epic-Entertainment-HUB/`.

## Add a game

Add an entry to `js/games.js`:

```js
{
  id: 'my-game',                       // used in share links: #play=my-game
  title: 'My Game',
  url: 'https://example.github.io/MyGame/',
  description: 'One or two sentences for the card.',
  tags: ['Arcade'],
  art: 'none',                         // 'taco' | 'blocks' | 'dice', or anything else for a letter tile
  accent: '#861B42',
}
```

Each game opens inside the HUB behind a loading screen, and can be linked directly with `#play=<id>`.

## Files

- `index.html`, `css/style.css` — page shell, loading screen, game player bar
- `js/main.js` — the three.js interface
- `js/games.js` — game list and the planned ranks (Owner, Admin, Player)
- `assets/` — logo, loading-screen images, display font (Archivo Black, OFL)
- `vendor/` — three.js r170 (MIT)

## Planned

Sign-ins with ranks, so Owners and Admins can add HTML games from inside the HUB.
When games come from other people, embed them in a sandboxed iframe.
