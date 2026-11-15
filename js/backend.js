// Accounts, ranks and HUB-added games, stored in Supabase.
// Everything here is a thin wrapper so the rest of the HUB never talks to
// Supabase directly. Who is allowed to do what is enforced by the database
// (see supabase/setup.sql), not by this file.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RULE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Accounts can be made without an email. Behind the scenes Supabase still needs
// one, so username-only accounts get a deterministic address on this throwaway
// domain (.invalid never resolves). A real email in contact_email is what unlocks
// the leaderboards.
const NOEMAIL_DOMAIN = 'noemail.epichub.invalid';
const syntheticEmail = (username) => username.toLowerCase() + '@' + NOEMAIL_DOMAIN;
export const MAX_HTML_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// { id, email, username, rank } while signed in, otherwise null.
export let me = null;
export const isStaff = () => Boolean(me && (me.rank === 'owner' || me.rank === 'admin'));

let db = null;
const listeners = new Set();
export function onAccountChange(fn) { listeners.add(fn); }
function announce() { listeners.forEach((fn) => fn(me)); }

function fail(error, fallback) {
  const text = (error && error.message) || fallback || 'Something went wrong';
  const friendly = [
    [/invalid login credentials/i, 'Wrong username/email or password.'],
    [/already registered|already been registered/i, 'That username or email already has an account. Try signing in.'],
    [/email not confirmed/i, 'Check your email and click the confirmation link first.'],
    [/password should be at least/i, 'Password is too short.'],
    [/database error saving new user/i, 'That username is taken or not allowed. Try another one.'],
    [/rate limit/i, 'Too many tries. Wait a minute and try again.'],
    [/row-level security|not authorized|permission denied/i, 'Your rank is not allowed to do that.'],
    [/failed to fetch|networkerror|load failed/i, 'Could not reach the server. It may be asleep: free Supabase projects pause after a quiet week.'],
    [/mime type|not supported/i, 'That file type is not allowed.'],
    [/exceeded the maximum allowed size/i, 'That file is too big.'],
  ].find(([pattern]) => pattern.test(text));
  return new Error(friendly ? friendly[1] : text);
}

function loadLibrary() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement('script');
    s.src = 'vendor/supabase.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the accounts library'));
    document.head.appendChild(s);
  });
}

async function loadProfile(user) {
  if (!user) { me = null; return; }
  const { data } = await db.from('profiles')
    .select('username, rank, xp, weekly_xp, diamonds, streak, last_reward, contact_email')
    .eq('id', user.id).maybeSingle();
  const contact = (data && data.contact_email) || null;
  me = {
    id: user.id,
    email: contact,                    // the email the player added, or null
    hasEmail: Boolean(contact),        // true once they can appear on the boards
    username: (data && data.username) || 'player',
    rank: (data && data.rank) || 'player',
    xp: (data && data.xp) || 0,
    weeklyXp: (data && data.weekly_xp) || 0,
    diamonds: (data && data.diamonds) || 0,
    streak: (data && data.streak) || 0,
    lastReward: (data && data.last_reward) || null,
  };
}

// The UTC date as YYYY-MM-DD, matching how the daily reward is tracked server-side.
export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Whether today's daily reward is still unclaimed (null profile = not signed in).
export function dailyAvailable() {
  return Boolean(me) && me.lastReward !== utcToday();
}

// Connect and restore any saved session. Resolves even if the server is down.
export async function start() {
  if (!configured) return;
  try {
    await loadLibrary();
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await db.auth.getSession();
    await loadProfile(data.session && data.session.user);
    db.auth.onAuthStateChange((event, session) => {
      // Supabase asks that nothing awaits its client inside this callback.
      setTimeout(async () => {
        const user = session && session.user;
        if ((user && user.id) === (me && me.id)) return;
        await loadProfile(user).catch(() => { me = null; });
        announce();
      }, 0);
    });
  } catch (err) {
    console.error('Accounts are unavailable', err);
    db = null;
  }
  announce();
}

export const online = () => Boolean(db);

function need() {
  if (!db) throw new Error(configured ? 'Could not reach the server. Try again in a moment.' : 'Sign-ups are not switched on yet.');
}

/* ------------------------------ accounts ------------------------------ */

// Email is optional. Leave it blank for a username-only account; a real email
// can be added later (addEmail) to join the leaderboards.
export async function signUp({ username, email, password }) {
  need();
  username = (username || '').trim();
  email = (email || '').trim();
  if (!USERNAME_RULE.test(username)) throw new Error('Usernames are 3-20 letters, numbers or underscores.');
  if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
  if (email && !EMAIL_RULE.test(email)) throw new Error('That email looks off. Leave it blank to skip it for now.');
  const taken = await db.from('profiles').select('id').ilike('username', username.replace(/_/g, '\\_')).limit(1);
  if (taken.data && taken.data.length) throw new Error('That username is taken.');
  const { data, error } = await db.auth.signUp({
    email: email || syntheticEmail(username),
    password,
    options: { data: { username }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw fail(error);
  // No session means the project wants the email address confirmed first.
  if (!data.session) return { needsConfirmation: true, email };
  await loadProfile(data.session.user);
  announce();
  return { needsConfirmation: false, email };
}

// Sign in with either a username (any account) or an email (accounts that added one).
export async function signIn({ identifier, password }) {
  need();
  identifier = (identifier || '').trim();
  const email = identifier.includes('@') ? identifier : syntheticEmail(identifier);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw fail(error);
  await loadProfile(data.user);
  announce();
}

// Add (or change) the email that puts a player on the leaderboards.
export async function addEmail(email) {
  need();
  if (!me) throw new Error('Sign in first.');
  email = (email || '').trim();
  if (!EMAIL_RULE.test(email)) throw new Error('That email looks off — check it and try again.');
  const { error } = await db.from('profiles').update({ contact_email: email }).eq('id', me.id);
  if (error) throw fail(error);
  me.email = email;
  me.hasEmail = true;
  announce();
}

export async function signOut() {
  need();
  await db.auth.signOut();
  me = null;
  announce();
}

export async function listMembers() {
  need();
  const { data, error } = await db.from('profiles').select('id, username, rank, created_at').order('created_at').limit(500);
  if (error) throw fail(error);
  return data;
}

export async function setRank(id, rank) {
  need();
  const { data, error } = await db.from('profiles').update({ rank }).eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data || !data.length) throw new Error('Your rank is not allowed to do that.');
}

/* -------------------------------- games ------------------------------- */

const publicUrl = (bucket, path) => db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

function toGame(row) {
  return {
    id: 'g-' + row.id.slice(0, 8),
    rowId: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags || [],
    url: row.url || null,
    fileUrl: row.file_path ? publicUrl('game-files', row.file_path) : null,
    image: row.image_path ? publicUrl('game-images', row.image_path) : null,
    filePath: row.file_path,
    imagePath: row.image_path,
    accent: '#008080',
    removable: true,
  };
}

export async function listGames() {
  if (!db) return [];
  const { data, error } = await db.from('games').select('*').order('created_at').limit(200);
  if (error) throw fail(error);
  return data.map(toGame);
}

const randomName = (ext) => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + ext;

async function upload(bucket, file, name, contentType) {
  const { error } = await db.storage.from(bucket).upload(name, file, { contentType, cacheControl: '3600', upsert: false });
  if (error) throw fail(error);
  return name;
}

// game: { title, description, tags[], url? , htmlFile?, imageFile? }
export async function addGame({ title, description, tags, url, htmlFile, imageFile }) {
  need();
  if (!isStaff()) throw new Error('Only Owners and Admins can add games.');
  if (!title.trim()) throw new Error('Give the game a title.');
  if (Boolean(url) === Boolean(htmlFile)) throw new Error('Give either a link or an HTML file.');
  if (url && !/^https:\/\/\S+$/.test(url)) throw new Error('The link has to start with https://');
  if (htmlFile) {
    if (!/\.html?$/i.test(htmlFile.name)) throw new Error('The game file has to be a .html file.');
    if (htmlFile.size > MAX_HTML_BYTES) throw new Error('The HTML file is over 20 MB.');
  }
  if (imageFile) {
    if (!IMAGE_TYPES.includes(imageFile.type)) throw new Error('The picture has to be a PNG, JPG, WebP or GIF.');
    if (imageFile.size > MAX_IMAGE_BYTES) throw new Error('The picture is over 2 MB.');
  }

  let filePath = null, imagePath = null;
  try {
    if (htmlFile) filePath = await upload('game-files', htmlFile, randomName('.html'), 'text/html');
    if (imageFile) {
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[imageFile.type];
      imagePath = await upload('game-images', imageFile, randomName(ext), imageFile.type);
    }
    const { data, error } = await db.from('games').insert({
      title: title.trim().slice(0, 40),
      description: description.trim().slice(0, 200),
      tags: tags.slice(0, 3),
      url: url || null,
      file_path: filePath,
      image_path: imagePath,
    }).select().single();
    if (error) throw fail(error);
    return toGame(data);
  } catch (err) {
    // Don't leave orphaned uploads behind if the last step failed.
    if (filePath) db.storage.from('game-files').remove([filePath]).catch(() => {});
    if (imagePath) db.storage.from('game-images').remove([imagePath]).catch(() => {});
    throw err;
  }
}

export async function removeGame(game) {
  need();
  const { data, error } = await db.from('games').delete().eq('id', game.rowId).select('id');
  if (error) throw fail(error);
  if (!data || !data.length) throw new Error('Your rank is not allowed to do that.');
  if (game.filePath) db.storage.from('game-files').remove([game.filePath]).catch(() => {});
  if (game.imagePath) db.storage.from('game-images').remove([game.imagePath]).catch(() => {});
}

const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

// Edit an existing HUB-added game (Owners/Admins). Fields: title, description,
// tags[], url (link games only), imageFile (optional replacement picture).
export async function editGame(game, { title, description, tags, url, imageFile }) {
  need();
  if (!isStaff()) throw new Error('Only Owners and Admins can edit games.');
  if (!title.trim()) throw new Error('Give the game a title.');
  const patch = { title: title.trim().slice(0, 40), description: description.trim().slice(0, 200), tags: tags.slice(0, 3) };
  if (game.url) {   // a link game: the URL can be changed (uploaded games keep their file)
    if (!/^https:\/\/\S+$/.test((url || '').trim())) throw new Error('The link has to start with https://');
    patch.url = url.trim();
  }
  if (imageFile) {
    if (!IMAGE_TYPES.includes(imageFile.type)) throw new Error('The picture has to be a PNG, JPG, WebP or GIF.');
    if (imageFile.size > MAX_IMAGE_BYTES) throw new Error('The picture is over 2 MB.');
  }
  let newImage = null;
  try {
    if (imageFile) { newImage = await upload('game-images', imageFile, randomName(IMG_EXT[imageFile.type]), imageFile.type); patch.image_path = newImage; }
    const { data, error } = await db.from('games').update(patch).eq('id', game.rowId).select().single();
    if (error) throw fail(error);
    if (newImage && game.imagePath) db.storage.from('game-images').remove([game.imagePath]).catch(() => {});
    return toGame(data);
  } catch (err) {
    if (newImage) db.storage.from('game-images').remove([newImage]).catch(() => {});
    throw err;
  }
}

/* ------------------------------ play counts ---------------------------- */

// Map of game key -> play count, for sorting the list. Readable signed out.
export async function listPlayCounts() {
  if (!db) return {};
  const { data, error } = await db.from('play_counts').select('game_key, plays');
  if (error) return {};
  const m = {};
  for (const r of data) m[r.game_key] = r.plays;
  return m;
}

// Register one play of a game (built-in or added). Anyone can, best-effort.
export async function recordPlay(gameKey) {
  if (!db || !gameKey) return;
  await db.rpc('hub_play', { p_key: String(gameKey) }).then(() => {}, () => {});
}

/* -------------------------------- comments ----------------------------- */

export const MAX_COMMENT = 500;
// Anyone can delete their own comment; Owners and Admins can delete any.
export const canModerate = () => isStaff();

// One game's comments, newest first, with each author's username and rank.
// Readable signed out.
export async function listComments(gameKey, limit = 100) {
  if (!db || !gameKey) return [];
  const { data, error } = await db.from('hub_comments')
    .select('id, body, game_key, created_at, user_id, username, rank')
    .eq('game_key', String(gameKey))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw fail(error);
  return data || [];
}

export async function postComment(gameKey, body) {
  need();
  if (!me) throw new Error('Sign in to post a comment.');
  if (!gameKey) throw new Error('Open a game to comment on it.');
  body = (body || '').trim();
  if (!body) throw new Error('Write something first.');
  const { error } = await db.from('comments').insert({ user_id: me.id, game_key: String(gameKey), body: body.slice(0, MAX_COMMENT) });
  if (error) throw fail(error);
}

export async function deleteComment(id) {
  need();
  const { data, error } = await db.from('comments').delete().eq('id', id).select('id');
  if (error) throw fail(error);
  if (!data || !data.length) throw new Error('You can only delete your own comments.');
}

/* --------------------------- XP & leaderboard -------------------------- */

// Fetch the top players. scope is 'week' or 'all'. Readable even signed out.
export async function leaderboard(scope) {
  if (!db) return [];
  const view = scope === 'all' ? 'hub_board_alltime' : 'hub_board_weekly';
  const { data, error } = await db.from(view).select('username, rank, score');
  if (error) throw fail(error);
  return data;
}

// Report active play time (seconds) and bank the XP / diamonds it earned.
export async function reportActiveTime(seconds) {
  if (!db || !me || !(seconds > 0)) return;
  const { data, error } = await db.rpc('hub_award_active', { p_seconds: Math.round(seconds) });
  if (error) return;                     // earning is best-effort; never block play
  const row = data && data[0];
  if (row) { me.xp = row.xp; me.weeklyXp = row.weekly_xp; me.diamonds = row.diamonds; }
}

// First play of a game each day earns the variety bonus. Safe to call every open.
export async function reportVariety(gameKey) {
  if (!db || !me || !gameKey) return false;
  const { data, error } = await db.rpc('hub_award_variety', { p_game_key: String(gameKey) });
  if (error) return false;
  const row = data && data[0];
  if (row) { me.xp = row.xp; me.weeklyXp = row.weekly_xp; }
  return Boolean(row && row.awarded);
}

// Claim today's daily reward. Returns { claimed, reward, streak } or null.
export async function claimDaily() {
  need();
  const { data, error } = await db.rpc('hub_claim_daily');
  if (error) throw fail(error);
  const row = data && data[0];
  if (row) {
    me.diamonds = row.diamonds;
    me.streak = row.streak;
    if (row.claimed) me.lastReward = utcToday();
  }
  return row;
}
