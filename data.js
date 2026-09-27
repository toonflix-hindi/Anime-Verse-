/* ============================================================
   🔥 ANIMEVERSE — Firebase + AniList API
   Project: anistreamx-903a3
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBHCaQPCzEJ0QTPZaXgx0xuk4f6eb_OuRU",
  authDomain: "anistreamx-903a3.firebaseapp.com",
  databaseURL: "https://anistreamx-903a3-default-rtdb.firebaseio.com",
  projectId: "anistreamx-903a3",
  storageBucket: "anistreamx-903a3.firebasestorage.app",
  messagingSenderId: "670816164518",
  appId: "1:670816164518:web:6a3222731f6b22696d3267",
  measurementId: "G-DW23SVGE6W"
};

let animeDB = [];
let dbReady = false;
const _cbs = [];

if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.database();
  window.animeRef = db.ref('animeverse/anime');
  window.statsRef = db.ref('animeverse/analytics');
  loadFromFirebase();
}

function loadFromFirebase() {
  animeRef.on('value', (snap) => {
    const data = snap.val() || {};
    animeDB = Object.keys(data).map(k => ({ _key: k, ...data[k] }));
    animeDB.sort((a, b) => (a.id || 0) - (b.id || 0));
    if (!dbReady) {
      dbReady = true;
      _cbs.forEach(cb => cb());
      _cbs.length = 0;
    }
    if (typeof window.onDataUpdate === 'function') window.onDataUpdate();
  }, err => console.error('Firebase:', err));
}

function onDBReady(cb) {
  if (dbReady) cb();
  else _cbs.push(cb);
}

/* ---------- Helpers ---------- */
const langLabels = { jp:"🇯🇵 JP", hi:"🇮🇳 हिंदी", en:"🇬🇧 EN", sub:"📝 SUB" };

const imgUrl = (s, w=300, h=450) => {
  if (!s) return `https://picsum.photos/${w}/${h}`;
  if (s.startsWith('http')) return s;
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
};

const getAnime = id => animeDB.find(a => a.id === Number(id));

/* ============================================================
   📊 ANALYTICS
   ============================================================ */
async function trackView(animeId, episodeNum) {
  const today = new Date().toISOString().split('T')[0];
  try {
    await statsRef.child('totalViews').transaction(v => (v || 0) + 1);
    await statsRef.child('perAnime/anime_' + animeId).transaction(v => (v || 0) + 1);
    await statsRef.child('dailyViews/' + today).transaction(v => (v || 0) + 1);
    const key = 'act_' + Date.now();
    await statsRef.child('recentActivity/' + key).set({
      type: 'view', animeId, episode: episodeNum,
      timestamp: Date.now()
    });
  } catch (e) { console.warn('Analytics error:', e); }
}

async function trackWatchTime(seconds) {
  try {
    await statsRef.child('totalWatchTime').transaction(v => (v || 0) + seconds);
  } catch (e) {}
}

/* ============================================================
   🎯 ANILIST API
   ============================================================ */
const ANILIST_URL = 'https://graphql.anilist.co';

async function searchAniList(query, page = 1) {
  const gql = `
    query ($search: String, $page: Int) {
      Page(page: $page, perPage: 20) {
        pageInfo { currentPage lastPage hasNextPage }
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          genres
          averageScore
          episodes
          status
          seasonYear
          format
        }
      }
    }
  `;
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query, page } })
  });
  const json = await res.json();
  return json.data?.Page || null;
}

function anilistToAnime(a, customId) {
  const title = a.title.english || a.title.romaji || a.title.native || 'Untitled';
  const desc = (a.description || 'No description available.')
    .replace(/<[^>]*>/g, '').slice(0, 800);
  return {
    id: customId,
    title,
    poster: a.coverImage.extraLarge || a.coverImage.large,
    banner: a.bannerImage || a.coverImage.extraLarge || a.coverImage.large,
    rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : 8.0,
    lang: 'jp',
    genres: a.genres || [],
    status: a.status === 'RELEASING' ? 'ONGOING' : 'FINISHED',
    year: a.seasonYear || new Date().getFullYear(),
    description: desc,
    isNew: true,
    anilistId: a.id,
    totalEpisodes: a.episodes || 0,
    seasons: [{ number: 1, episodes: [] }]
  };
}