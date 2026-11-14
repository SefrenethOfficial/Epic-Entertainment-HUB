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

/* ------------------------------ sign in / up ------------------------------ */

export function openAuth(startWith = 'in') {
  let mode = startWith;
  const username = el('input', { type: 'text', name: 'username', autocomplete: 'username', maxLength: 20, spellcheck: false });
  const email = el('input', { type: 'email', name: 'email', autocomplete: 'email', required: true });
  const password = el('input', { type: 'password', name: 'password', required: true, minLength: 8 });
  const userField = field('Username', username, '3-20 letters, numbers or underscores');
  const passField = field('Password', password, 'At least 8 characters');
  const status = el('p', { className: 'win-status', role: 'alert' });
  const submit = el('button', { type: 'submit', className: 'win-btn primary' });
  const tabIn = el('button', { type: 'button', className: 'win-tab', onclick: () => setMode('in') }, 'Sign In');
  const tabUp = el('button', { type: 'button', className: 'win-tab', onclick: () => setMode('up') }, 'Sign Up');

  function setMode(next) {
    mode = next;
    const up = mode === 'up';
    tabIn.setAttribute('aria-pressed', String(!up));
    tabUp.setAttribute('aria-pressed', String(up));
    userField.hidden = !up;
    username.required = up;
    passField.querySelector('small').hidden = !up;
    password.autocomplete = up ? 'new-password' : 'current-password';
    submit.textContent = up ? 'Create account' : 'Sign In';
    status.textContent = '';
  }

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, mode === 'up' ? 'Creating your account…' : 'Signing in…', async () => {
      if (mode === 'up') {
        const result = await backend.signUp({ username: username.value.trim(), email: email.value.trim(), password: password.value });
        if (result.needsConfirmation) {
          form.replaceChildren(el('p', {}, 'Almost there! We sent a confirmation link to ' + email.value.trim() + '. Click it, then come back and sign in.'),
            el('div', { className: 'win-actions' }, el('button', { type: 'button', className: 'win-btn primary', onclick: () => dlg.close() }, 'OK')));
          return;
        }
      } else {
        await backend.signIn({ email: email.value.trim(), password: password.value });
      }
      dlg.close();
      hooks.toast('Welcome, ' + backend.me.username + '! Rank: ' + RANK_NAMES[backend.me.rank]);
    });
  } },
    el('div', { className: 'win-tabs' }, tabIn, tabUp),
    userField,
    field('Email', email),
    passField,
    status,
    el('div', { className: 'win-actions' }, submit),
  );
  const dlg = openWindow('Epic Entertainment HUB - Account', form);
  setMode(mode);
  (mode === 'up' ? username : email).focus();
}

/* -------------------------------- account -------------------------------- */

export function openAccount() {
  const me = backend.me;
  if (!me) return openAuth();
  const body = el('div', { className: 'win-form' },
    el('p', { className: 'win-who' }, el('strong', {}, me.username), ' ', el('span', { className: 'rank rank-' + me.rank }, RANK_NAMES[me.rank])),
    el('p', { className: 'win-small' }, me.email),
    el('div', { className: 'win-actions stack' },
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
  const image = el('input', { type: 'file', accept: backend.IMAGE_TYPES.join(',') });
  const byLink = el('input', { type: 'radio', name: 'source', checked: true });
  const byFile = el('input', { type: 'radio', name: 'source' });
  const linkField = field('Game link', url, 'Where the game is hosted, e.g. a GitHub Pages address');
  const fileField = field('Game file', html, 'One self-contained .html file, up to 20 MB');
  const status = el('p', { className: 'win-status', role: 'alert' });

  const sync = () => {
    linkField.hidden = !byLink.checked;
    fileField.hidden = byLink.checked;
    url.required = byLink.checked;
    html.required = !byLink.checked;
  };
  byLink.addEventListener('change', sync);
  byFile.addEventListener('change', sync);

  const form = el('form', { className: 'win-form', onsubmit: (e) => {
    e.preventDefault();
    run(form, status, 'Adding the game…', async () => {
      const tagList = tags.value.split(',').map((t) => t.trim().slice(0, 16)).filter(Boolean).slice(0, 3);
      const game = await backend.addGame({
        title: title.value,
        description: description.value,
        tags: tagList,
        url: byLink.checked ? url.value.trim() : '',
        htmlFile: byLink.checked ? null : html.files[0],
        imageFile: image.files[0] || null,
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
      el('label', { className: 'win-radio' }, byFile, ' Upload an HTML file')),
    linkField,
    fileField,
    field('Picture (optional)', image, 'PNG, JPG, WebP or GIF, up to 2 MB'),
    status,
    el('div', { className: 'win-actions' },
      el('button', { type: 'button', className: 'win-btn', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { type: 'submit', className: 'win-btn primary' }, 'Add game')),
  );
  const dlg = openWindow('Add a Game', form, 420);
  sync();
  title.focus();
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
