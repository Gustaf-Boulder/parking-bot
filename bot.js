require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const CHANNEL = process.env.SLACK_CHANNEL_ID;

// --- MORGON-INTRON (konstiga öppningar) ---
const morgonIntron = [
  "🌅 Solen har gått upp. Bilarna väntar. Ödet är oundvikligt.",
  "🛸 Parkeringsoraklet har vaknat ur sin betongslummer...",
  "🧙 Vid gula linjernas makt — jag kallar fram dagens bokningar!",
  "🦆 En anka viskade till mig om parkeringen. Här är vad den sa:",
  "🔮 Asfalten har talat. Bäva inför dess visdom:",
  "🤖 BEEP BOOP. Parkeringsdata inhämtad. Mänskligheten analyserad. Dömande påbörjat.",
  "🎺 *fanfar spelas* Parkeringstidningen har anlänt.",
  "🧻 Rullar ut dagens heliga parkeringsrulle...",
  "☁️ Molnen formar sig till en P-skylt. Det är ett tecken.",
  "🌮 Inte taco-tisdag, men det ÄR parkeringsuppdateringstid:",
];

// --- ROASTS ---
function generateRoast(bookings, restricted) {
  const roasts = [];

  if (bookings.length > 0) {
    const target = bookings[Math.floor(Math.random() * bookings.length)];
    const email = target.user_email?.split('@')[0] || 'Någon';
    const spot = target.spot_name || `#${target.spot_number}`;
    const reg = target.vehicle_registration;

    roasts.push(
      `🔥 *${email}* tog plats *${spot}* igen. Snart är det väl dags att köpa den?`,
      `👀 *${email}*s ${reg ? `(${reg})` : 'bil'} känner sig så hemma på *${spot}* att den betalat handpenning.`,
      `🚗 *${email}* har bokat. Asfalten skakar. Historien upprepar sig.`,
      `🏆 Veckans MVP i kategorin "Upptar Betong" går till... *${email}*! Ingen är förvånad.`,
      `😮‍💨 *${email}* och plats *${spot}*. Ett kärleksförhållande äldre än WiFi-lösenordet.`,
    );
  }

  if (restricted.length > 0) {
    const r = restricted[Math.floor(Math.random() * restricted.length)];
    const rName = r.user_email?.split('@')[0] || 'Någon';
    roasts.push(`🚫 *${rName}* är på restriktionslistan. Parkeringen har tydligen standards.`);
  }

  if (roasts.length === 0) return "🏜️ Inga bokningar. Inget drama. Parkeringen gråter stilla.";
  return roasts[Math.floor(Math.random() * roasts.length)];
}

// --- GUSTAF-HYLLNING (en gång per dag, på lunchen) ---
const gustafHyllningar = [
  "🙏 Låt oss ta ett ögonblick för att hedra *Gustaf* — parkeringens gudfader, asfaltens konung, den ende som alltid vet var en ledig plats finns. Vi är inte värdiga.",
  "👑 Dagens påminnelse: *Gustaf* parkerade så bra en gång att en fågel landade på hans bil frivilligt. Av respekt.",
  "⚡ En gammal legend säger att *Gustaf* en gång parallellparkerade på första försöket. Vittnen grät. Någon applåderade.",
  "🌟 *Gustaf* — parkerade innan parkering var coolt. Parkerade efter att det slutade vara coolt. Parkerar fortfarande. Ikonen.",
  "🏛️ De gamla texterna talar om en man. En plats. En perfekt inbromsning. De kallar honom *Gustaf*.",
  "🕯️ Tyst minut för alla som inte är *Gustaf* och aldrig kommer att parkera lika bra som *Gustaf*.",
  "🎖️ *Gustaf* fick en gång en parkeringsbot. Han överklagade. Han vann. Domaren bad om en selfie.",
];

// --- MÅSEN-EXISTENTIALISM ---
const måsenQuotes = [
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Bilen kan vänta. Ölglaset kan inte."_\n— Okänd filosof, troligtvis på Måsen`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Vad är en parkeringsplats om inte ett tillfälligt hem för en maskin som längtar efter frihet? Gå till Måsen."_\n— Parkeringsboten, 2026`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Sokrates frågade 'vad är kunskap?'. Vi frågar: varför sitter du fortfarande på jobbet?"_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Sartre sa att helvetet är andra människor. Han hade uppenbarligen aldrig testat en fredagskväll på Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Livet är kort. Parkeringsavgiften är lång. Gå till Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Nietzsche sa att det som inte dödar oss gör oss starkare. Han syftade troligtvis på Måsens husmanskost."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"En bil utan förare är bara metall. En människa utan öl är ungefär detsamma."_\n— Måsen-skolan, filosofisk gren`,
];

// --- RANDOM EXISTENTIELLA MEDDELANDEN (dagtid) ---
const existentiella = [
  "🌀 Har du någonsin funderat på att din parkerade bil inte vet att du finns? Den bara... väntar. I mörkret. Ensam.",
  "🪨 Sisyfos rullade sin sten uppför berget varje dag. Vi bokar parkeringsplatser. Vem har det värst, egentligen?",
  "🌊 Heraklit sa att man aldrig kliver i samma flod två gånger. Man bokar heller aldrig exakt samma parkeringsplats två gånger. Tänk på det.",
  "🕳️ Universum är 13,8 miljarder år gammalt. Din bil har stått parkerad i 4 timmar. Känns det inte lite meningslöst?",
  "🧠 Vad är egentligen skillnaden mellan en parkeringsplats och ett liv? Båda är tillfälliga. Båda kostar mer än man tror.",
  "🌙 På natten när alla åkt hem — vad pratar bilarna om? Är de nöjda? Är vi nöjda?",
  "🪞 Om en bil parkerar i skogen och ingen ser den — har den verkligen parkerat?",
  "⏳ Varje sekund du sitter på jobbet är en sekund du inte sitter på Måsen. Det är inte en anklagelse. Det är matematik.",
  "🌿 Naturen har inga parkeringsplatser. Naturen mår bra. Samband? Kanske.",
  "💭 Einstein sa att tid är relativ. Uppenbarligen hade han aldrig väntat på en ledig parkeringsplats på en måndag.",
];

// --- HÄMTA DATA ---
async function getData() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const { data: bookings, error: bErr } = await supabase
    .from('parking_bookings')
    .select('booking_date, spot_number, spot_name, user_email, vehicle_registration')
    .in('booking_date', [today, tomorrow])
    .order('booking_date', { ascending: true })
    .order('spot_number', { ascending: true });

  if (bErr) throw new Error(`Bokningar misslyckades: ${bErr.message}`);

  const { data: restricted } = await supabase
    .from('user_restrictions')
    .select('user_email, reason, mode')
    .eq('is_active', true);

  return { bookings: bookings || [], restricted: restricted || [], today, tomorrow };
}

// --- FORMATERA BOKNINGAR ---
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

// --- SKICKA MORGONUPPDATERING (08:00) ---
async function postMorgon() {
  console.log(`[${new Date().toISOString()}] 🌅 Morgonuppdatering...`);
  try {
    const { bookings, restricted, today, tomorrow } = await getData();
    const intro = morgonIntron[Math.floor(Math.random() * morgonIntron.length)];
    const roast = generateRoast(bookings.filter(b => b.booking_date === today), restricted);

    await slack.chat.postMessage({
      channel: CHANNEL,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: intro } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🅿️ Dagens bokningar — ${today}*\n${formatList(bookings, today)}` } },
        { type: "section", text: { type: "mrkdwn", text: `*📅 Morgondagens bokningar — ${tomorrow}*\n${formatList(bookings, tomorrow)}` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🔥 Dagens roast*\n${roast}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `_${restricted.length} person(er) är för närvarande parkerade på restriktionslistan 🚫_` }] }
      ]
    });
    console.log('✅ Morgon postad!');
  } catch (err) {
    console.error('❌ Morgonfel:', err.message);
  }
}

// --- GUSTAF-HYLLNING (12:00) ---
async function postGustaf() {
  console.log(`[${new Date().toISOString()}] 👑 Gustaf-hyllning...`);
  try {
    const msg = gustafHyllningar[Math.floor(Math.random() * gustafHyllningar.length)];
    await slack.chat.postMessage({
      channel: CHANNEL,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }]
    });
    console.log('✅ Gustaf hyllad!');
  } catch (err) {
    console.error('❌ Gustaf-fel:', err.message);
  }
}

// --- MÅSEN-FRÅGAN (14:00) ---
async function postMåsen() {
  console.log(`[${new Date().toISOString()}] 🍺 Måsen-frågan...`);
  try {
    const msg = måsenQuotes[Math.floor(Math.random() * måsenQuotes.length)];
    await slack.chat.postMessage({
      channel: CHANNEL,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }]
    });
    console.log('✅ Måsen postad!');
  } catch (err) {
    console.error('❌ Måsen-fel:', err.message);
  }
}

// --- EXISTENTIELL KRIS (16:00) ---
async function postExistentiell() {
  console.log(`[${new Date().toISOString()}] 🌀 Existentiell kris...`);
  try {
    const msg = existentiella[Math.floor(Math.random() * existentiella.length)];
    await slack.chat.postMessage({
      channel: CHANNEL,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }]
    });
    console.log('✅ Existentiell kris levererad!');
  } catch (err) {
    console.error('❌ Existentiellt fel:', err.message);
  }
}

// --- SCHEMA ---
// 08:00 — Morgonuppdatering med bokningar + roast
cron.schedule('0 8 * * 1-5', postMorgon);

// 12:00 — Gustaf hyllas
cron.schedule('0 12 * * 1-5', postGustaf);

// 14:00 — Måsen-frågan med djup livscitat
cron.schedule('0 14 * * 1-5', postMåsen);

// 16:00 — Existentiell random tanke
cron.schedule('0 16 * * 1-5', postExistentiell);

// Kör direkt vid start (för testning — ta bort sen)
postMorgon();

console.log('🤖 Parkeringsboten lever. Den funderar. Den dömer.');