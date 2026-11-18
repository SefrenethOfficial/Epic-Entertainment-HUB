// The HUB's pop-up windows (sign in, account, members, add a game).
// Forms need real text boxes, so these are ordinary HTML styled as Windows 95
// dialogs and shown on top of the three.js page.

import * as backend from './backend.js';

let hooks = { toast: () => {}, gamesChanged: () => {} };
export function setHooks(h) { hooks = { ...hooks, ...h }; }

const RANK_NAMES = { owner: 'Owner', admin: 'Admin', player: 'Player' };

// Tiny element builder. Text always goes in as text, never as HTML.
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function openWindow(title, body, width = 360) {
  const dlg = el('dialog', { className: 'win' });
  dlg.style.width = `min(${width}px, calc(100vw - 20px))`;
  dlg.append(
    el('div', { className: 'win-bar' },
      el('span', {}, title),
      el('button', { type: 'button', className: 'win-x', ariaLabel: 'Close', onclick: () => dlg.close() }, '×')),
    el('div', { className: 'win-body' }, body),
  );
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

function field(label, input, hint) {
  return el('label', { className: 'win-field' },
    el('span', {}, label), input, hint ? el('small', {}, hint) : null);
}

// Runs an async action from a form: disables the buttons, shows errors.
async function run(form, status, busyText, action) {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach((b) => { b.disabled = true; });
  status.className = 'win-status';
  status.textContent = busyText;
  try {
    await action();
  } catch (err) {
    status.className = 'win-status error';
    status.textContent = err.message || 'Something went wrong.';
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

/* ------------------------------ pick a username ------------------------------ */

export function openAuth() {
  const username = el('input', { type: 'text', name: 'username', autocomplete: 'off', maxLength: 20, spellcheck: false, placeholder: 'e.g. TacoFan99' });
  const status = el('p', { className: 'win-status', role: 'alert' });

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Setting you up…', async () => {
      await backend.claimUsername(username.value.trim());
      dlg.close();
      hooks.toast("Welcome, " + backend.me.username + "! You're all set.");
      hooks.gamesChanged();
    });
  } },
    el('p', { className: 'win-small' }, "Pick a username and you're in — no email, no password. It's how you show up in comments and on the leaderboards."),
    field('Username', username, '3-20 letters, numbers or underscores'),
    status,
    el('div', { className: 'win-actions' }, el('button', { type: 'submit', className: 'win-btn primary' }, 'Let’s go')),
    el('button', { type: 'button', className: 'win-link', onclick: () => ownerMode() }, 'Owner sign-in'),
  );

  // The owner's email + password way in — tucked behind a link.
  function ownerMode() {
    const id = el('input', { type: 'text', autocomplete: 'username', placeholder: 'Email or username' });
    const pw = el('input', { type: 'password', autocomplete: 'current-password', required: true });
    const ostatus = el('p', { className: 'win-status', role: 'alert' });
    const oform = el('form', { className: 'win-form', onsubmit: (e) => {
      e.preventDefault();
      run(oform, ostatus, 'Signing in…', async () => {
        await backend.signIn({ identifier: id.value.trim(), password: pw.value });
        dlg.close();
        hooks.toast('Welcome back, ' + backend.me.username + '! Rank: ' + RANK_NAMES[backend.me.rank]);
        hooks.gamesChanged();
      });
    } },
      field('Email or username', id),
      field('Password', pw),
      ostatus,
      el('div', { className: 'win-actions' }, el('button', { type: 'submit', className: 'win-btn primary' }, 'Sign In')),
      el('button', { type: 'button', className: 'win-link', onclick: () => { dlg.querySelector('.win-body').replaceChildren(form); username.focus(); } }, 'Back'),
    );
    dlg.querySelector('.win-body').replaceChildren(oform);
    id.focus();
  }

  const dlg = openWindow('Join the HUB', form);
  username.focus();
}

/* -------------------------------- account -------------------------------- */

export function openAccount() {
  const me = backend.me;
  if (!me) return openAuth();
  const body = el('div', { className: 'win-form' },
    el('div', { className: 'win-avatar-row' },
      el('img', { className: 'win-avatar', src: backend.pfpSrc(me.pfp), alt: '' }),
      el('p', { className: 'win-who' }, el('strong', {}, me.username), ' ', el('span', { className: 'rank rank-' + me.rank }, RANK_NAMES[me.rank]))),
    el('p', { className: 'win-stats' },
      el('strong', {}, (me.xp || 0).toLocaleString()), ' XP',
      '  •  ', el('strong', {}, (me.diamonds || 0).toLocaleString()), ' diamonds',
      '  •  ', el('strong', {}, String(me.streak || 0)), ' day streak'),
    el('div', { className: 'win-actions stack' },
      el('button', { type: 'button', className: 'win-btn', onclick: () => { dlg.close(); openRename(); } }, 'Change name…'),
      backend.isStaff() ? el('button', { type: 'button', className: 'win-btn', onclick: () => { dlg.close(); openAddGame(); } }, 'Add a game…') : null,
      el('button', { type: 'button', className: 'win-btn', onclick: () => { dlg.close(); openMembers(); } }, 'Members…'),
      el('button', { type: 'button', className: 'win-btn', onclick: async () => {
        await backend.signOut().catch(() => {});
        dlg.close();
        hooks.toast('Signed out. See you next time!');
      } }, 'Sign Out')),
  );
  const dlg = openWindow('My Account', body, 320);
}

/* ------------------------------ change name ------------------------------ */

export function openRename() {
  const me = backend.me;
  if (!me) return openAuth();
  const username = el('input', { type: 'text', name: 'username', autocomplete: 'off', maxLength: 20, spellcheck: false, value: me.username });
  const status = el('p', { className: 'win-status', role: 'alert' });

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Changing your name…', async () => {
      await backend.renameUser(username.value.trim());
      dlg.close();
      hooks.toast('Name changed — you’re now ' + backend.me.username + '!');
      if (hooks.renamed) hooks.renamed();
    });
  } },
    el('p', { className: 'win-small' }, 'Pick a new username — it updates everywhere, in your comments and on the leaderboards.'),
    field('Username', username, '3-20 letters, numbers or underscores'),
    status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Save'),
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel')),
  );

  const dlg = openWindow('Change Name', form, 340);
  username.focus(); username.select();
}

/* --------------------------- shop: manage faces --------------------------- */

const RARITY_OPTS = ['starter', 'common', 'uncommon', 'rare', 'legendary'];

function faceForm(item) {
  const name = el('input', { type: 'text', maxLength: 28, spellcheck: false, value: item ? item.name : '', placeholder: 'e.g. Cowboy Face' });
  const price = el('input', { type: 'number', min: '0', step: '1', value: item ? String(item.price) : '0' });
  const rarity = el('select', {}, ...RARITY_OPTS.map((r) => el('option', { value: r }, r[0].toUpperCase() + r.slice(1))));
  rarity.value = item ? item.rarity : 'common';
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const urlIn = el('input', { type: 'url', spellcheck: false, placeholder: 'https://… (or leave blank)' });
  const sort = item ? el('input', { type: 'number', step: '1', value: String(item.sort || 0) }) : null;
  return { name, price, rarity, file, urlIn, sort,
    fields: [
      field('Name', name),
      field('Price (💎)', price),
      field('Rarity', rarity),
      field('Image file', file, item ? 'Leave empty to keep the current image' : 'A PNG with a see-through background looks best'),
      field('…or image address', urlIn),
      sort ? field('Shelf order', sort, 'Lower numbers sit first') : null,
    ] };
}

export function openAddFace() {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can manage faces.');
  const f = faceForm(null);
  const status = el('p', { className: 'win-status', role: 'alert' });
  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Adding the face…', async () => {
      await backend.addPfp({ name: f.name.value, price: f.price.value, rarity: f.rarity.value,
        imageFile: f.file.files[0] || null, imageUrl: f.urlIn.value });
      dlg.close();
      hooks.toast('Added ' + f.name.value.trim() + ' to the shop!');
      if (hooks.facesChanged) hooks.facesChanged();
    });
  } }, ...f.fields, status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Add to shop'),
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel')));
  const dlg = openWindow('Add a face', form, 360);
  f.name.focus();
}

export function openEditFace(item) {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can manage faces.');
  const f = faceForm(item);
  const status = el('p', { className: 'win-status', role: 'alert' });
  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Saving…', async () => {
      await backend.editPfp(item.id, { name: f.name.value, price: f.price.value, rarity: f.rarity.value,
        sort: f.sort ? f.sort.value : null, imageFile: f.file.files[0] || null, imageUrl: f.urlIn.value });
      dlg.close();
      hooks.toast('Saved ' + f.name.value.trim() + '.');
      if (hooks.facesChanged) hooks.facesChanged();
    });
  } },
    el('div', { className: 'win-avatar-row' }, el('img', { className: 'win-avatar', src: item.src || backend.pfpSrc(item.id), alt: '' }),
      el('p', { className: 'win-small' }, 'Editing ', el('strong', {}, item.name))),
    ...f.fields, status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Save'),
      item.id === 'classic' ? null
        : el('button', { type: 'button', className: 'win-btn danger', onclick: () => {
            if (hooks.deleteFace) hooks.deleteFace(item); dlg.close();
          } }, 'Delete'),
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel')));
  const dlg = openWindow('Edit face', form, 360);
  f.name.focus();
}

/* ---------------------------- shows (the theater) --------------------------- */

const KIND_OPTS = [['show', 'Series / Show'], ['movie', 'Movie']];

function showForm(item) {
  const title = el('input', { type: 'text', maxLength: 80, spellcheck: false, value: item ? item.title : '', placeholder: 'e.g. Epic Quest' });
  const kind = el('select', {}, ...KIND_OPTS.map(([v, l]) => el('option', { value: v }, l)));
  kind.value = item ? item.kind : 'show';
  const rating = el('input', { type: 'text', maxLength: 10, spellcheck: false, value: item ? item.rating : '', placeholder: 'e.g. PG, TV-MA, 18+' });
  const starsIn = el('input', { type: 'number', min: '0', max: '5', step: '0.5', value: item ? String(item.stars) : '0' });
  const bannerFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const bannerUrl = el('input', { type: 'url', spellcheck: false, placeholder: 'https://… poster/banner' });
  const backdropFile = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const backdropUrl = el('input', { type: 'url', spellcheck: false, placeholder: 'https://… wide hero image' });
  const description = el('textarea', { rows: 3, maxLength: 600, placeholder: 'What’s it about?' });
  if (item) description.value = item.description || '';
  const watchUrl = el('input', { type: 'url', spellcheck: false, value: item ? (item.watchUrl || '') : '', placeholder: 'https://… (YouTube, Drive, etc.)' });
  const featured = el('input', { type: 'checkbox' });
  if (item && item.featured) featured.checked = true;
  const featLabel = el('label', { className: 'win-check' }, featured, el('span', {}, 'Feature in the hero'));
  const sort = item ? el('input', { type: 'number', step: '1', value: String(item.sort || 0) }) : null;
  const get = () => ({ title: title.value, kind: kind.value, rating: rating.value, stars: starsIn.value,
    description: description.value, watchUrl: watchUrl.value, featured: featured.checked,
    sort: sort ? sort.value : undefined,
    bannerFile: bannerFile.files[0] || null, bannerUrl: bannerUrl.value,
    backdropFile: backdropFile.files[0] || null, backdropUrl: backdropUrl.value });
  const fields = [
    field('Title', title),
    field('Type', kind),
    field('Content rating', rating),
    field('Star rating (0–5)', starsIn),
    field('Name banner / poster', bannerFile, item ? 'Leave empty to keep the current image' : null),
    field('…or banner address', bannerUrl),
    field('Hero image (wide)', backdropFile, 'Shown big behind the hero'),
    field('…or hero image address', backdropUrl),
    field('Description', description),
    field('Watch link', watchUrl, 'YouTube or Google Drive. A Drive file must be shared “Anyone with the link”.'),
    featLabel,
    sort ? field('Shelf order', sort, 'Lower numbers first') : null,
  ];
  return { get, fields, focus: title };
}

export function openAddShow() {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can manage shows.');
  const f = showForm(null);
  const status = el('p', { className: 'win-status', role: 'alert' });
  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Adding…', async () => {
      await backend.addShow(f.get());
      dlg.close();
      hooks.toast('Added to the theater!');
      if (hooks.showsChanged) hooks.showsChanged();
    });
  } }, ...f.fields, status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Add title'),
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel')));
  const dlg = openWindow('Add a title', form, 380);
  f.focus.focus();
}

export function openEditShow(item) {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can manage shows.');
  const f = showForm(item);
  const status = el('p', { className: 'win-status', role: 'alert' });
  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Saving…', async () => {
      await backend.editShow(item.id, f.get());
      dlg.close();
      hooks.toast('Saved ' + item.title + '.');
      if (hooks.showsChanged) hooks.showsChanged();
    });
  } }, ...f.fields, status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Save'),
      el('button', { type: 'button', className: 'win-btn danger', onclick: () => { if (hooks.deleteShow) hooks.deleteShow(item); dlg.close(); } }, 'Delete'),
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel')));
  const dlg = openWindow('Edit title', form, 380);
  f.focus.focus();
}

/* -------------------------------- members -------------------------------- */

export function openMembers() {
  const list = el('div', { className: 'win-list' }, 'Loading members…');
  const status = el('p', { className: 'win-status', role: 'alert' });
  const dlg = openWindow('Members', el('div', { className: 'win-form' }, list, status,
    el('div', { className: 'win-actions' }, el('button', { type: 'button', className: 'win-btn primary', onclick: () => dlg.close() }, 'Close'))), 380);

  backend.listMembers().then((members) => {
    const iAmOwner = backend.me && backend.me.rank === 'owner';
    const rows = members.map((m) => {
      let rankCell;
      if (iAmOwner && m.rank !== 'owner') {
        const select = el('select', { ariaLabel: 'Rank for ' + m.username },
          el('option', { value: 'player' }, 'Player'), el('option', { value: 'admin' }, 'Admin'));
        select.value = m.rank;
        select.addEventListener('change', async () => {
          const wanted = select.value;
          select.disabled = true;
          status.className = 'win-status';
          status.textContent = 'Saving…';
          try {
            await backend.setRank(m.id, wanted);
            m.rank = wanted;
            status.textContent = m.username + ' is now ' + RANK_NAMES[wanted] + '.';
          } catch (err) {
            select.value = m.rank;
            status.className = 'win-status error';
            status.textContent = err.message;
          }
          select.disabled = false;
        });
        rankCell = select;
      } else {
        rankCell = el('span', { className: 'rank rank-' + m.rank }, RANK_NAMES[m.rank] || m.rank);
      }
      return el('tr', {}, el('td', {}, m.username), el('td', {}, rankCell));
    });
    list.replaceChildren(el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Username'), el('th', {}, 'Rank'))),
      el('tbody', {}, rows.length ? rows : el('tr', {}, el('td', { colSpan: 2 }, 'Nobody has signed up yet.')))));
  }).catch((err) => {
    list.textContent = '';
    status.className = 'win-status error';
    status.textContent = err.message;
  });
}

/* ------------------------------- add a game ------------------------------ */

export function openAddGame() {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can add games.');
  const title = el('input', { type: 'text', required: true, maxLength: 40 });
  const description = el('textarea', { rows: 2, maxLength: 200 });
  const tags = el('input', { type: 'text', maxLength: 60, placeholder: 'Arcade, Puzzle, 2D' });
  const url = el('input', { type: 'url', placeholder: 'https://…', pattern: 'https://.+' });
  const html = el('input', { type: 'file', accept: '.html,.htm,text/html' });
  const code = el('textarea', { rows: 5, placeholder: '<!DOCTYPE html>…', spellcheck: false });
  const image = el('input', { type: 'file', accept: backend.IMAGE_TYPES.join(',') });
  const imageUrl = el('input', { type: 'url', placeholder: 'https://…/cover.png' });

  const byLink = el('input', { type: 'radio', name: 'source', checked: true });
  const byFile = el('input', { type: 'radio', name: 'source' });
  const byCode = el('input', { type: 'radio', name: 'source' });
  const linkField = field('Game link', url, 'Where the game is hosted, e.g. a GitHub Pages address');
  const fileField = field('Game file', html, 'One self-contained .html file, up to 20 MB');
  const codeField = field('Game HTML', code, 'Paste a self-contained HTML game, up to 20 MB');

  const imgFile = el('input', { type: 'radio', name: 'imgsource', checked: true });
  const imgLink = el('input', { type: 'radio', name: 'imgsource' });
  const imageFileField = field('Picture file', image, 'PNG, JPG, WebP or GIF, up to 2 MB');
  const imageUrlField = field('Picture address', imageUrl, 'A direct https:// link to an image');
  const status = el('p', { className: 'win-status', role: 'alert' });

  const sync = () => {
    linkField.hidden = !byLink.checked;
    fileField.hidden = !byFile.checked;
    codeField.hidden = !byCode.checked;
    url.required = byLink.checked;
    html.required = byFile.checked;
    code.required = byCode.checked;
    imageFileField.hidden = !imgFile.checked;
    imageUrlField.hidden = !imgLink.checked;
  };
  [byLink, byFile, byCode, imgFile, imgLink].forEach((r) => r.addEventListener('change', sync));

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Adding the game…', async () => {
      const tagList = tags.value.split(',').map((t) => t.trim().slice(0, 16)).filter(Boolean).slice(0, 3);
      const game = await backend.addGame({
        title: title.value,
        description: description.value,
        tags: tagList,
        url: byLink.checked ? url.value.trim() : '',
        htmlFile: byFile.checked ? html.files[0] : null,
        htmlText: byCode.checked ? code.value : '',
        imageFile: imgFile.checked ? (image.files[0] || null) : null,
        imageUrl: imgLink.checked ? imageUrl.value.trim() : '',
      });
      dlg.close();
      hooks.toast(game.title + ' was added to the HUB!');
      hooks.gamesChanged();
    });
  } },
    field('Title', title),
    field('Description', description),
    field('Tags', tags, 'Up to 3, separated by commas'),
    el('fieldset', { className: 'win-group' },
      el('legend', {}, 'Where is the game?'),
      el('label', { className: 'win-radio' }, byLink, ' Link to a hosted game'),
      el('label', { className: 'win-radio' }, byFile, ' Upload an HTML file'),
      el('label', { className: 'win-radio' }, byCode, ' Paste HTML code')),
    linkField,
    fileField,
    codeField,
    el('fieldset', { className: 'win-group' },
      el('legend', {}, 'Picture (optional)'),
      el('label', { className: 'win-radio' }, imgFile, ' Upload a file'),
      el('label', { className: 'win-radio' }, imgLink, ' Image address')),
    imageFileField,
    imageUrlField,
    status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Add game')),
  );
  const dlg = openWindow('Add a Game', form, 420);
  sync();
  title.focus();
}

export function openEditGame(game) {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can edit games.');
  const title = el('input', { type: 'text', required: true, maxLength: 40, value: game.title || '' });
  const description = el('textarea', { rows: 2, maxLength: 200, value: game.description || '' });
  const tags = el('input', { type: 'text', maxLength: 60, value: (game.tags || []).join(', ') });
  const url = el('input', { type: 'url', placeholder: 'https://…', value: game.url || '' });
  const image = el('input', { type: 'file', accept: backend.IMAGE_TYPES.join(',') });
  const imageUrl = el('input', { type: 'url', placeholder: 'https://…/cover.png' });
  const imgFile = el('input', { type: 'radio', name: 'imgsource', checked: true });
  const imgLink = el('input', { type: 'radio', name: 'imgsource' });
  const imageFileField = field('Picture file', image, 'Leave empty to keep the current one');
  const imageUrlField = field('Picture address', imageUrl, 'A direct https:// link to an image');
  const status = el('p', { className: 'win-status', role: 'alert' });
  const isLink = Boolean(game.url);
  const syncImg = () => { imageFileField.hidden = !imgFile.checked; imageUrlField.hidden = !imgLink.checked; };
  imgFile.addEventListener('change', syncImg);
  imgLink.addEventListener('change', syncImg);

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Saving…', async () => {
      const tagList = tags.value.split(',').map((t) => t.trim().slice(0, 16)).filter(Boolean).slice(0, 3);
      await backend.editGame(game, {
        title: title.value, description: description.value, tags: tagList, url: url.value,
        imageFile: imgFile.checked ? (image.files[0] || null) : null,
        imageUrl: imgLink.checked ? imageUrl.value.trim() : '',
      });
      dlg.close();
      hooks.toast('Saved changes to ' + title.value.trim() + '.');
      hooks.gamesChanged();
    });
  } },
    field('Title', title),
    field('Description', description),
    field('Tags', tags, 'Up to 3, separated by commas'),
    isLink ? field('Game link', url, 'Where the game is hosted') : null,
    el('fieldset', { className: 'win-group' },
      el('legend', {}, 'Replace picture (optional)'),
      el('label', { className: 'win-radio' }, imgFile, ' Upload a file'),
      el('label', { className: 'win-radio' }, imgLink, ' Image address')),
    imageFileField,
    imageUrlField,
    status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Save')),
  );
  const dlg = openWindow('Edit Game', form, 420);
  syncImg();
  title.focus();
}

/* --------------------------------- news ---------------------------------- */

export function openNews(current, onSave) {
  if (!backend.isStaff()) return hooks.toast('Only Owners and Admins can edit the news.');
  const box = el('textarea', { rows: 6, value: current || '', spellcheck: false });
  const status = el('p', { className: 'win-status', role: 'alert' });
  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Saving…', async () => {
      await onSave(box.value);
      dlg.close();
      hooks.toast('News updated!');
    });
  } },
    el('p', { className: 'win-small' }, 'One headline per line. They scroll across the ticker at the bottom of the screen for everyone.'),
    box,
    status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Save news')),
  );
  const dlg = openWindow('Edit the News', form, 420);
  box.focus();
}

/* -------------------------------- comments ------------------------------- */

function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = secs / 60;
  if (mins < 60) return Math.round(mins) + 'm ago';
  const hrs = mins / 60;
  if (hrs < 24) return Math.round(hrs) + 'h ago';
  const days = hrs / 24;
  if (days < 7) return Math.round(days) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

export function openComments(game) {
  if (!game || !game.id) return hooks.toast('Open a game to see its comments.');
  const list = el('div', { className: 'win-list comments' }, 'Loading comments…');
  const status = el('p', { className: 'win-status', role: 'alert' });
  let changed = false;   // did the count change? refresh the card badges on close

  async function refresh() {
    try {
      const rows = await backend.listComments(game.id, 100);
      if (!rows.length) {
        list.replaceChildren(el('p', { className: 'win-small' }, 'No comments yet — be the first to say something!'));
        return;
      }
      const canMod = backend.canModerate();
      const mine = backend.me && backend.me.id;
      list.replaceChildren(...rows.map((c) => el('div', { className: 'comment' },
        el('div', { className: 'comment-head' },
          el('span', { className: 'rank rank-' + c.rank }, c.username),
          el('span', { className: 'comment-time' }, timeAgo(c.created_at)),
          (canMod || c.user_id === mine)
            ? el('button', { type: 'button', className: 'comment-del', ariaLabel: 'Delete comment', title: 'Delete', onclick: async () => {
                try { await backend.deleteComment(c.id); changed = true; refresh(); }
                catch (err) { status.className = 'win-status error'; status.textContent = err.message; }
              } }, '×')
            : null),
        el('div', { className: 'comment-body' }, c.body))));
    } catch (err) {
      list.textContent = '';
      status.className = 'win-status error';
      status.textContent = err.message;
    }
  }

  let composer;
  if (backend.me) {
    const box = el('textarea', { rows: 2, maxLength: backend.MAX_COMMENT, placeholder: 'Say something…', required: true });
    composer = el('form', { className: 'win-form comment-form', onsubmit: (e) => {
      e.preventDefault();
      run(composer, status, 'Posting…', async () => {
        await backend.postComment(game.id, box.value);
        box.value = '';
        changed = true;
        await refresh();
      });
    } },
      box,
      el('div', { className: 'win-actions' }, el('button', { type: 'submit', className: 'win-btn primary' }, 'Post')));
  } else {
    composer = el('p', { className: 'win-small' }, 'Everyone can read the comments. Sign in to post one.');
  }

  const title = (game.title || 'Game').slice(0, 24);
  const dlg = openWindow('Comments · ' + title, el('div', { className: 'win-form' }, list, status, composer), 440);
  dlg.addEventListener('close', () => { if (changed) hooks.gamesChanged(); });
  refresh();
}

/* -------------------------------- confirm -------------------------------- */

export function confirmWindow(message, okLabel = 'OK') {
  return new Promise((resolve) => {
    let answer = false;
    const dlg = openWindow('Epic Entertainment HUB', el('div', { className: 'win-form' },
      el('p', {}, message),
      el('div', { className: 'win-actions' },
        el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel'),
        el('button', { type: 'button', className: 'win-btn primary', onclick: () => { answer = true; dlg.close(); } }, okLabel))), 340);
    dlg.addEventListener('close', () => resolve(answer));
  });
}
