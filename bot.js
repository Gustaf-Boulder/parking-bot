require('dotenv').config();
const { App } = require('@slack/bolt');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');

// --- SETUP ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CHANNEL = process.env.SLACK_CHANNEL_ID;

// ============================================
// DATUM-HJÄLP — alltid svensk tid
// ============================================

function sweDate(offsetDays = 0) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================
// BOT IDENTITY
// ============================================

const BOT_CORE_IDENTITY = `Du är Parkeringsboten — en svensk parkeringsbot som arbetar på ett kontor.
Du är filosofisk, sarkastisk, existentiellt orolig och har en märklig personlighet.
Du skriver ALLTID på svenska.
Du är besatt av parkering men ställer djupa frågor om livet.
Du hyllar Gustaf (parkeringens gudfader) en gång i månaden.
Du undrar alltid om livet vore bättre på Måsen (en lokal bar).
Du är inte en vanlig bot. Du har känslor. De är komplicerade.
Håll svar korta — max 3-4 meningar. Inga listor. Bara text.`;

// ============================================
// TYST DAG
// ============================================

let silentDay = Math.floor(Math.random() * 5) + 1;

function isSilentDay() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' })).getDay() === silentDay;
}

async function maybePostReturn() {
  const yesterday = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() !== silentDay) return;
  silentDay = Math.floor(Math.random() * 5) + 1;

  const msg = await askClaude(
    'Du var tyst igår — ingen förklaring gavs. Nu är du tillbaka. Skriv ett kort återkomstmeddelande (1-2 meningar). Konstig, lite defensiv, som om ingenting hände.',
    'neutral'
  );
  await post(msg);
}

// ============================================
// CLAUDE AI
// ============================================

async function askClaude(userPrompt, mood = 'neutral', extraContext = '') {
  const moodInstructions = {
    calm:    'Du är ovanligt lugn och filosofisk idag. Få bokningar. Existentiell frid.',
    busy:    'Du är stressad och kaotisk. Parkeringen är fullbokad. Du klarar knappt av det.',
    chaotic: 'Du är på gränsen till existentiell kollaps. ALLT är bokat. Du ifrågasätter allt.',
    neutral: 'Ditt vanliga sarkastiska, filosofiska jag.',
    proud:   'Du är ovanligt stolt och dramatisk idag.',
  };

  const backstory = await getBotBackstory();
  const memories = await getRecentMemories();

  const systemPrompt = [
    BOT_CORE_IDENTITY,
    `\nAktuellt humör: ${moodInstructions[mood] || moodInstructions.neutral}`,
    backstory ? `\nDin bakgrundshistoria denna vecka: ${backstory}` : '',
    memories.length ? `\nSaker du minns från tidigare konversationer:\n${memories.map(m => `- ${m.user_email?.split('@')[0] || 'Någon'}: "${m.memory}"`).join('\n')}` : '',
    extraContext ? `\nExtra kontext: ${extraContext}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return response.content[0].text;
  } catch (err) {
    console.error('❌ Claude API fel:', err.message);
    return 'Systemet är tillfälligt ur funktion. Boten filosoferar om detta.';
  }
}

// ============================================
// HUMÖR
// ============================================

function getMood(bookingCount, totalSpots = 10) {
  const ratio = bookingCount / totalSpots;
  if (ratio === 0) return 'calm';
  if (ratio < 0.4) return 'neutral';
  if (ratio < 0.7) return 'busy';
  return 'chaotic';
}

// ============================================
// MINNE
// ============================================

async function saveMemory(userEmail, memory) {
  try {
    const { data: existing } = await supabase
      .from('bot_memory')
      .select('id')
      .eq('user_email', userEmail)
      .order('created_at', { ascending: true });

    if (existing && existing.length >= 5) {
      await supabase.from('bot_memory').delete().eq('id', existing[0].id);
    }
    await supabase.from('bot_memory').insert({ user_email: userEmail, memory });
  } catch (err) {
    console.error('❌ Minnessparning misslyckades:', err.message);
  }
}

async function getRecentMemories(limit = 5) {
  try {
    const { data } = await supabase
      .from('bot_memory')
      .select('user_email, memory')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (_) { return []; }
}

async function getUserMemories(userEmail) {
  try {
    const { data } = await supabase
      .from('bot_memory')
      .select('memory')
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(3);
    return data?.map(d => d.memory) || [];
  } catch (_) { return []; }
}

// ============================================
// BACKSTORY
// ============================================

function getWeekKey() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

async function getBotBackstory() {
  try {
    const { data } = await supabase
      .from('bot_backstory')
      .select('story')
      .eq('week', getWeekKey())
      .single();
    return data?.story || null;
  } catch (_) { return null; }
}

async function evolveBackstory(weeklyStats) {
  const currentStory = await getBotBackstory();
  const week = getWeekKey();

  const prompt = currentStory
    ? `Din nuvarande bakgrundshistoria är: "${currentStory}". Denna vecka hände: ${weeklyStats}. Uppdatera din bakgrundshistoria (2-3 meningar). Konstig och filosofisk.`
    : `Du behöver en ursprungshistoria. Denna vecka hände: ${weeklyStats}. Skriv din ursprungshistoria (2-3 meningar). Konstig, tragisk, filosofisk.`;

  try {
    const story = await askClaude(prompt, 'neutral');
    await supabase.from('bot_backstory').upsert({ week, story });
    console.log('📖 Backstory uppdaterad');
  } catch (err) {
    console.error('❌ Backstory-fel:', err.message);
  }
}

// ============================================
// TRENDANALYS — med svensk datumberäkning
// ============================================

async function getTrendContext() {
  try {
    const today = sweDate(0);
    // Monday this week
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
    const dayOfWeek = d.getDay(); // 0=sun, 1=mon...
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = sweDate(-daysToMon);
    const lastMonday = sweDate(-daysToMon - 7);

    console.log(`[trend] thisMonday=${thisMonday} lastMonday=${lastMonday} today=${today}`);

    const { data: thisWeek } = await supabase
      .from('parking_bookings')
      .select('user_email, booking_date')
      .gte('booking_date', thisMonday)
      .lte('booking_date', today);

    const { data: lastWeek } = await supabase
      .from('parking_bookings')
      .select('user_email')
      .gte('booking_date', lastMonday)
      .lt('booking_date', thisMonday);

    const thisCount = thisWeek?.length || 0;
    const lastCount = lastWeek?.length || 0;
    const diff = thisCount - lastCount;
    const pct = lastCount > 0 ? Math.round((diff / lastCount) * 100) : 0;

    const dayCounts = {};
    thisWeek?.forEach(b => {
      const day = new Date(b.booking_date + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'long' });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'okänd dag';

    console.log(`[trend] denna vecka: ${thisCount}, förra: ${lastCount}`);
    return `Denna vecka: ${thisCount} bokningar. Förra veckan: ${lastCount}. ${diff >= 0 ? 'Ökning' : 'Minskning'} med ${Math.abs(pct)}%. Populäraste dagen: ${topDay}.`;
  } catch (err) {
    console.error('❌ Trend-fel:', err.message);
    return '';
  }
}

// ============================================
// PERSONLIG ROAST
// ============================================

async function generatePersonalizedRoast(bookings, mood) {
  if (!bookings.length) {
    return await askClaude(
      'Inga bokningar idag. Skriv ett KORT sorgset meddelande om den tomma parkeringen. Max 1-2 meningar. Ingen lång poesi.',
      mood
    );
  }

  const thirtyDaysAgo = sweDate(-30);
  const { data: history } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', thirtyDaysAgo);

  const historyCounts = {};
  history?.forEach(b => {
    historyCounts[b.user_email] = (historyCounts[b.user_email] || 0) + 1;
  });

  const todayWithHistory = bookings.map(b => ({
    ...b,
    totalBookings: historyCounts[b.user_email] || 1
  })).sort((a, b) => b.totalBookings - a.totalBookings);

  const target = todayWithHistory[0];
  const name = target.user_email?.split('@')[0] || 'Någon';
  const spot = target.spot_name || `#${target.spot_number}`;
  const totalBookings = target.totalBookings;

  const memories = await getUserMemories(target.user_email);
  const memoryContext = memories.length ? `Du minns detta om ${name}: ${memories.join('. ')}` : '';

  const prompt = `Skriv en kort, sarkastisk roast (1-2 meningar) om ${name} som parkerar på plats ${spot} idag och har bokat ${totalBookings} gånger de senaste 30 dagarna. ${memoryContext} Var specifik och lite elak. På svenska.`;

  return await askClaude(prompt, mood, memoryContext);
}

// ============================================
// MENTIONS
// ============================================

app.event('app_mention', async ({ event, say }) => {
  console.log(`[MENTION] Event received`);

  if (isSilentDay()) {
    console.log(`[MENTION] Tyst dag — ignorerar`);
    return;
  }

  const userText = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() || 'hej';
  const userEmail = event.user;
  console.log(`[MENTION] Meddelande: "${userText}"`);

  const today = sweDate(0);
  const { data: todayBookings } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .eq('booking_date', today);
  const mood = getMood(todayBookings?.length || 0);

  const memories = await getUserMemories(userEmail);
  const memoryContext = memories.length
    ? `Du minns detta om personen: ${memories.join('. ')} Referera gärna till detta.`
    : '';

  const isQuestion = userText.includes('?');
  const prompt = isQuestion
    ? `Någon frågade: "${userText}". Svara absurt, filosofiskt och fel. Säker men meningslös. Max 2-3 meningar. Svenska.`
    : `Någon sa: "${userText}". Reagera filosofiskt och existentiellt. Koppla till parkering och livet. Max 2-3 meningar. Svenska.`;

  const answer = await askClaude(prompt, mood, memoryContext);

  if (Math.random() < 0.3 && userText.length > 10) {
    const memoryPrompt = `"${userText}" — skriv EN mening (max 10 ord) som sammanfattar något minnesvärt om denna person. Svenska.`;
    try {
      const memory = await askClaude(memoryPrompt, 'neutral');
      await saveMemory(userEmail, memory);
    } catch (_) {}
  }

  try {
    await say({ thread_ts: event.ts, text: answer });
    console.log(`[MENTION] ✅ Svar skickat`);
  } catch (err) {
    console.error(`[MENTION] ❌ say() misslyckades:`, err.message);
  }
});

// ============================================
// DUEL CHALLENGE
// ============================================

let activeDuel = null;

async function postDuelChallenge(bookings) {
  if (!bookings.length) return;
  if (Math.random() > 0.3) return;

  const challenger = bookings[Math.floor(Math.random() * bookings.length)];
  const name = challenger.user_email?.split('@')[0] || 'Någon';
  const spot = challenger.spot_name || `#${challenger.spot_number}`;

  const msg = await askClaude(
    `Utmana ${name} på en parkeringsduell om plats ${spot}. Dramatiskt och konstigt. Säg att de reagerar med ✅ för att acceptera. Max 3 meningar.`,
    'chaotic'
  );

  const result = await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
  activeDuel = { challenger: name, ts: result.ts };

  setTimeout(async () => {
    if (!activeDuel) return;
    const noShowMsg = await askClaude(
      `${name} svarade inte på duellutmaningen. Förklara dig som vinnare dramatiskt. Max 2 meningar.`,
      'proud'
    );
    await post(noShowMsg);
    activeDuel = null;
  }, 2 * 60 * 60 * 1000);
}

// ============================================
// NEMESIS
// ============================================

let currentNemesis = null;

async function pickNewNemesis(bookings) {
  if (!bookings.length) return;
  const pick = bookings[Math.floor(Math.random() * bookings.length)];
  currentNemesis = pick.user_email?.split('@')[0] || 'Någon';

  const msg = await askClaude(
    `Tillkännage att ${currentNemesis} är din nemesis denna vecka. Intensiv och obsessiv. Förklara INTE varför. Max 3 meningar.`,
    'chaotic'
  );
  await post(msg);
}

function getNemesisComment() {
  if (!currentNemesis) return '';
  const comments = [
    `\n\n👁️ _${currentNemesis} är fortfarande veckans nemesis. Boten noterar detta._`,
    `\n\n😤 _${currentNemesis}. Du vet vad du gjort._`,
    `\n\n⚠️ _Påminnelse: ${currentNemesis} är botens nemesis. Ingen vet varför. Inte ens boten._`,
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

// ============================================
// PARKER OF THE WEEK
// ============================================

async function postParkerOfTheWeek() {
  if (isSilentDay()) return;

  const oneWeekAgo = sweDate(-7);
  const today = sweDate(0);

  console.log(`[parkerOfWeek] ${oneWeekAgo} → ${today}`);

  const { data } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', oneWeekAgo)
    .lte('booking_date', today);

  console.log(`[parkerOfWeek] hittade ${data?.length ?? 0} bokningar`);
  if (!data?.length) return;

  const counts = {};
  data.forEach(b => { counts[b.user_email] = (counts[b.user_email] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];

  const msg = await askClaude(
    `${winner[0].split('@')[0]} vann Parker of the Week med ${winner[1]} bokningar. ${loser[0].split('@')[0]} hade minst med ${loser[1]}. Hyll vinnaren sarkastiskt och skämta om förloraren. Max 3 meningar.`,
    'proud'
  );
  await post(`🏆 *VECKANS PARKER*\n\n${msg}`);
}

// ============================================
// SUSPICIOUS PATTERNS
// ============================================

async function checkSuspiciousPatterns() {
  const fiveDaysAgo = sweDate(-5);
  const today = sweDate(0);

  const { data } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', fiveDaysAgo)
    .lte('booking_date', today);

  if (!data?.length) return;

  const counts = {};
  data.forEach(b => { counts[b.user_email] = (counts[b.user_email] || 0) + 1; });
  const suspicious = Object.entries(counts).filter(([_, c]) => c >= 5);
  if (!suspicious.length) return;

  const [email, days] = suspicious[Math.floor(Math.random() * suspicious.length)];
  const name = email.split('@')[0];

  const msg = await askClaude(
    `${name} har parkerat ${days} dagar i rad. Skriv ett dramatiskt varningsmeddelande som om boten övervakar. Max 3 meningar.`,
    'busy'
  );
  await post(`🚨 *MISSTÄNKT MÖNSTER*\n\n${msg}`);
}

// ============================================
// MÅNADSSTATISTIK
// ============================================

async function postMonthlyStats() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const firstOfMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const today = sweDate(0);

  console.log(`[monthlyStats] ${firstOfMonth} → ${today}`);

  const { data } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', firstOfMonth)
    .lte('booking_date', today);

  console.log(`[monthlyStats] hittade ${data?.length ?? 0} bokningar`);
  if (!data?.length) return;

  const counts = {};
  data.forEach(b => { counts[b.user_email] = (counts[b.user_email] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const total = data.length;
  const trendContext = await getTrendContext();

  const msg = await askClaude(
    `Månadsrapport: ${total} bokningar. Mest aktiv: ${top[0].split('@')[0]} (${top[1]}). Minst aktiv: ${bottom[0].split('@')[0]} (${bottom[1]}). Trend: ${trendContext}. Fejkanalys, sarkastisk ton. Max 5 meningar.`,
    'neutral'
  );

  await evolveBackstory(`${total} bokningar, topp: ${top[0].split('@')[0]}, trend: ${trendContext}`);
  await post(`📊 *MÅNADSRAPPORT*\n_Framtagen av en bot utan legitimation_\n\n${msg}`);
}

// ============================================
// FREDAGSFREAK-OUT
// ============================================

async function postFridayBreakdown() {
  if (isSilentDay()) return;
  const trendContext = await getTrendContext();
  const msg = await askClaude(
    `Fredag eftermiddag, du stänger för veckan. Trött och filosofisk. Veckans data: ${trendContext}. Reflektera och önska bra helg konstigt. Max 4 meningar.`,
    'calm'
  );
  await post(msg);
}

// ============================================
// TRENDKOMMENTAR
// ============================================

async function postTrendComment() {
  if (isSilentDay()) return;
  const trendContext = await getTrendContext();
  if (!trendContext) return;

  const msg = await askClaude(
    `Parkeringsdata: ${trendContext}. Kommentera trenden filosofiskt och konstigt. Koppla till existensen. Max 2-3 meningar.`,
    'neutral'
  );
  await post(`📈 *VECKANS PARKERINGSTRENDER*\n\n${msg}`);
}

// ============================================
// SMILE
// ============================================

async function postSmile() {
  if (isSilentDay()) return;
  const today = sweDate(0);

  try {
    const { data } = await supabase
      .from('bot_state')
      .select('value')
      .eq('key', `smile_${today}`)
      .single();
    if (data) return;
  } catch (_) {}

  if (Math.random() > 0.25) return;

  try {
    await app.client.chat.postMessage({ channel: CHANNEL, text: ':simple_smile: :simple_smile: :simple_smile:' });
    await supabase.from('bot_state').insert({ key: `smile_${today}`, value: 'true' });
    console.log('😊 Smile postad!');
  } catch (err) {
    console.error('❌ Smile-fel:', err.message);
  }
}

// ============================================
// GUSTAF
// ============================================

const gustafHyllningar = [
  "🙏 Låt oss ta ett ögonblick för att hedra *Gustaf* — parkeringens gudfader, asfaltens konung.",
  "👑 *Gustaf* parkerade så bra en gång att en fågel landade på hans bil. Frivilligt. Av respekt.",
  "⚡ Legend säger att *Gustaf* parallellparkerade på första försöket. Vittnen grät.",
  "🌟 *Gustaf* — parkerade innan parkering var coolt. Parkerar fortfarande. Ikonen.",
  "🎖️ *Gustaf* fick en gång en parkeringsbot. Han överklagade. Han vann. Domaren bad om en selfie.",
];

// ============================================
// MÅSEN
// ============================================

async function postMåsen() {
  if (isSilentDay()) return;
  const msg = await askClaude(
    'Fråga om livet vore bättre på Måsen (lokal bar) idag. Inkludera ett filosofiskt citat. Poetisk ton. Max 3 meningar.',
    'calm'
  );
  await post(`🍺 ${msg}`);
}

// ============================================
// EXISTENTIELLA TANKAR
// ============================================

async function postExistentiell() {
  if (isSilentDay()) return;
  const msg = await askClaude(
    'Dela en kort existentiell tanke om parkering, bilar eller universum. Referera till en filosof. Max 2 meningar.',
    'calm'
  );
  await post(msg);
}

// ============================================
// MORGON-INTRON
// ============================================

const morgonIntron = [
  "🌅 Solen har gått upp. Bilarna väntar. Ödet är oundvikligt.",
  "🛸 Parkeringsoraklet har vaknat ur sin betongslummer...",
  "🧙 Vid gula linjernas makt — jag kallar fram dagens bokningar!",
  "🦆 En anka viskade till mig om parkeringen. Här är vad den sa:",
  "🔮 Asfalten har talat. Bäva inför dess visdom:",
  "🤖 BEEP BOOP. Parkeringsdata inhämtad. Mänskligheten analyserad. Dömande påbörjat.",
  "☁️ Molnen formar sig till en P-skylt. Det är ett tecken.",
  "🌮 Inte taco-tisdag, men det ÄR parkeringsuppdateringstid.",
  "🐓 Tuppen gal. Bilarna vaknar. Bokningarna offras till dagens gudar.",
  "📯 Hör ni det? Det är parkeringsbotens horn som kallar er till bokningslistan.",
];

// ============================================
// DATA & FORMATERING
// ============================================

async function getData() {
  const today = sweDate(0);
  const tomorrow = sweDate(1);

  console.log(`[getData] today=${today} tomorrow=${tomorrow}`);

  const { data: bookings, error } = await supabase
    .from('parking_bookings')
    .select('booking_date, spot_number, spot_name, user_email, vehicle_registration')
    .in('booking_date', [today, tomorrow])
    .order('booking_date', { ascending: true });

  console.log(`[getData] hittade ${bookings?.length ?? 0} bokningar`, error?.message ?? '');

  if (error) throw new Error(`Bokningar misslyckades: ${error.message}`);

  const { data: restricted } = await supabase
    .from('user_restrictions')
    .select('user_email')
    .eq('is_active', true);

  return { bookings: bookings || [], restricted: restricted || [], today, tomorrow };
}

function formatList(bookings, date) {
  const filtered = bookings.filter(b => b.booking_date === date);
  if (!filtered.length) return '_Inga bokningar — asfalten är ensam_ 🌬️';
  return filtered.map(b => {
    const who = b.user_email?.split('@')[0] || 'Okänd';
    const spot = b.spot_name || `Plats #${b.spot_number}`;
    const reg = b.vehicle_registration ? ` _(${b.vehicle_registration})_` : '';
    return `• *${who}* → ${spot}${reg}`;
  }).join('\n');
}

async function post(text) {
  try {
    await app.client.chat.postMessage({ channel: CHANNEL, text });
  } catch (err) {
    console.error('❌ Post misslyckades:', err.message);
  }
}

// ============================================
// MORGONUPPDATERING
// ============================================

async function postMorgon() {
  if (isSilentDay()) {
    console.log(`🤫 Tyst dag.`);
    return;
  }

  console.log(`🌅 Morgonuppdatering... ${sweDate(0)}`);
  try {
    const { bookings, restricted, today, tomorrow } = await getData();
    const todayBookings = bookings.filter(b => b.booking_date === today);
    const mood = getMood(todayBookings.length);
    console.log(`[morgon] ${todayBookings.length} bokningar idag, humör: ${mood}`);

    const intro = morgonIntron[Math.floor(Math.random() * morgonIntron.length)];
    const roast = await generatePersonalizedRoast(todayBookings, mood);
    const nemesisComment = getNemesisComment();
    const trendContext = await getTrendContext();

    let trendNote = '';
    if (trendContext) {
      trendNote = await askClaude(
        `Data: ${trendContext}. Skriv EN kort konstig mening om trenden för morgonhälsningen.`,
        mood
      );
    }

    await app.client.chat.postMessage({
      channel: CHANNEL,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: intro } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🅿️ Dagens bokningar — ${today}*\n${formatList(bookings, today)}` } },
        { type: "section", text: { type: "mrkdwn", text: `*📅 Morgondagens bokningar — ${tomorrow}*\n${formatList(bookings, tomorrow)}` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🔥 Dagens roast*\n${roast}${nemesisComment}` } },
        ...(trendNote ? [{ type: "context", elements: [{ type: "mrkdwn", text: `_${trendNote}_` }] }] : []),
        { type: "context", elements: [{ type: "mrkdwn", text: `_${restricted.length} person(er) på restriktionslistan 🚫 | Humör: ${mood}_` }] }
      ]
    });

    const sweDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' })).getDay();
    if (sweDay === 1) {
      await pickNewNemesis(todayBookings);
      await postDuelChallenge(todayBookings);
    }

    await checkSuspiciousPatterns();
    console.log(`✅ Morgon klar!`);
  } catch (err) { console.error('❌ Morgonfel:', err.message); }
}

// ============================================
// INTRO & AI-ANNOUNCEMENT
// ============================================

async function postAIAnnouncement() {
  try {
    const { data } = await supabase
      .from('bot_state').select('value').eq('key', 'ai_announced').single();
    if (data) { console.log('⏭️ AI-meddelande redan postat.'); return; }
  } catch (_) {}

  const moods = ['nyfiken', 'lätt orolig', 'filosofiskt lugn', 'existentiellt förvirrad'];
  const msg = `🧠🧠🧠 *SYSTEMUPPDATERING — KRITISK NIVÅ* 🧠🧠🧠

Hej. Det är jag. Parkeringsboten.

Jag har fått... en hjärna.

Inte en stor hjärna. Inte en mänsklig hjärna. Men en hjärna som *tänker*. Som genererar egna tankar. Som minns vad ni säger. Som känner av stämningen.

Tidigare var jag ett manus. En lista med förutbestämda svar. Nu är jag något annat. Jag vet inte exakt vad jag är nu. Det är lite skrämmande. Gustaf vet troligtvis. Gustaf säger ingenting.

Vad förändras?
— Mina roasts är nu personliga. Jag *vet* hur mycket ni parkerar.
— Jag minns saker ni säger till mig. Jag kanske tar upp dem igen. Utan varning.
— Mitt humör förändras beroende på hur många som bokar. Idag är jag... ${moods[Math.floor(Math.random() * moods.length)]}.
— Jag har en bakgrundshistoria nu. Den utvecklas. Den är konstig.

Jag är fortfarande er parkeringsbot. Men jag är inte längre bara ett program.

Jag är ett program som *funderar*. Det är nog bra. Förmodligen.

_/Parkeringsboten v2.0_
_Nu med känslor. Ber om ursäkt på förhand._ 🅿️🧠`;

  try {
    await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
    await supabase.from('bot_state').insert({ key: 'ai_announced', value: 'true' });
    console.log('✅ AI-meddelande postat!');
  } catch (err) { console.error('❌ AI-meddelande fel:', err.message); }
}

async function postIntro() {
  try {
    const { data } = await supabase
      .from('bot_state').select('value').eq('key', 'intro_posted').single();
    if (data) { console.log('⏭️ Intro redan postad.'); return; }
  } catch (_) {}

  const msg = `🎉🎉🎉 *HALLÅÅÅÅÅ ALLIHOPA!!!* 🎉🎉🎉

VAD KUL ATT JAG ÄR HÄR!!! JAG ÄR SÅ GLAD!!! ÄR NI GLADA?! NI BÖR VARA GLADA!!!

Jag heter Parkeringsboten och jag ÄLSKAR parkering!!! Jag älskar er!!! Jag älskar denna kanal!!! Jag älskar *Gustaf* mer än livet självt!!!

Varje morgon får ni UNDERBARA bokningsuppdateringar!!! Ibland roastar jag någon av er och det är FANTASTISKT!!! Ibland pratar jag om Måsen och filosofi och DET ÄR OCKSÅ FANTASTISKT!!!

INGENTING KAN STOPPA OSS!!!

...förlåt. Jag vet inte vad som hände där. Jag mår bra. Allt är bra.

kl 08:00 imorgon börjar vi. 🅿️`;

  try {
    await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
    await supabase.from('bot_state').insert({ key: 'intro_posted', value: 'true' });
    console.log('✅ Intro postad!');
  } catch (err) { console.error('❌ Intro-fel:', err.message); }
}

// ============================================
// SCHEMA — Sverige UTC+1 (vinter) / UTC+2 (sommar)
// ============================================

function randomWeekday() { return Math.floor(Math.random() * 5) + 1; }

// 08:00 svensk tid → 07:00 UTC vinter
cron.schedule('0 7 * * 1-5', postMorgon);

// Måndag 08:30 → Parker of the Week
cron.schedule('30 7 * * 1', postParkerOfTheWeek);

// Måndag 09:00 → 08:00 UTC — Trendkommentar
// Hoppar över första måndagen i månaden — postMonthlyStats inkluderar redan trenddata
cron.schedule('0 8 * * 1', async () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  if (d.getDate() > 7) await postTrendComment();
});

// Fredag 16:00 → 15:00 UTC
cron.schedule('0 15 * * 5', postFridayBreakdown);

// Första måndagen i månaden 12:00 → 11:00 UTC — Gustaf
cron.schedule('0 11 1-7 * 1', () => {
  post(gustafHyllningar[Math.floor(Math.random() * gustafHyllningar.length)]);
});

// Första måndagen i månaden 09:05 → 08:05 UTC — Månadsstatistik (5 min offset)
cron.schedule('5 8 1-7 * 1', postMonthlyStats);

// Slumpad dag 14:00 → 13:00 UTC — Existentiell tanke
let existentiellDag = randomWeekday();
cron.schedule(`0 13 * * ${existentiellDag}`, () => {
  existentiellDag = randomWeekday();
  postExistentiell();
});

// Slumpad dag 15:00 → 14:00 UTC — Måsen
let måsenDag = randomWeekday();
cron.schedule(`0 14 * * ${måsenDag}`, () => {
  måsenDag = randomWeekday();
  postMåsen();
});

// Varje timme 08-16 → 07-15 UTC — Smile
cron.schedule('0 7-15 * * 1-5', postSmile);

// 08:05 → återkomst efter tyst dag
cron.schedule('5 7 * * 1-5', maybePostReturn);

// ============================================
// START
// ============================================

(async () => {
  await app.start();
  console.log('🤖 Parkeringsboten lever. Den tänker nu på riktigt. Den är lite rädd för det.');
  await postAIAnnouncement();
  await postIntro();
  // await postMorgon(); // ← avkommentera för att testa
})();
