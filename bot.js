require('dotenv').config();
const { App } = require('@slack/bolt');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

// --- SETUP ---
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const CHANNEL = process.env.SLACK_CHANNEL_ID;

// ============================================
// ABSURD ANSWER ENGINE
// ============================================

const absurdOpeners = [
  "Bra fråga. Fel forum.",
  "Jag förstår din fråga och väljer aktivt att ignorera den.",
  "Intressant. Helt irrelevant, men intressant.",
  "Ah. En fråga. Hur... mänskligt av dig.",
  "Jag har analyserat din fråga i 0.003 sekunder och kommit fram till att den är meningslös.",
  "Systemet har mottagit din fråga. Systemet bryr sig inte.",
  "Din fråga har placerats i kön. Kön är stängd.",
  "Jag är en parkeringsbot. Du frågar mig om livet?",
  "Bearbetning... bearbetning... nej.",
  "Fascinating. Completely wrong forum, but fascinating.",
  "Jag ska vara ärlig. Jag lyssnade inte.",
  "Din fråga har vidarebefordrats till rätt avdelning. Det finns ingen rätt avdelning.",
];

const absurdAnswers = [
  // Existentiella nonsvar
  "Svaret är 7. Nej vänta, 7 är frågan. Svaret är ost.",
  "Enligt min beräkning: ja. Eller nej. Beror på om månen är i stigande fas.",
  "Statistiskt sett har 83% av alla som ställt denna fråga ångrat sig. Grattis.",
  "Svaret du söker gömmer sig under en parkerad Volvo på plats 4B.",
  "Jag frågade asfalten. Den vägrade svara. Det är ditt svar.",
  "Hm. Intressant. Fel. Men intressant.",
  "Det beror helt på om du menar det i den tredje dimensionen eller i parkeringshuset.",
  "Svaret är uppenbart för alla utom dig. Och mig. Men framförallt dig.",
  "Ja. Nej. Kanske. Parkeringsplats. Någon av dessa är rätt.",
  "Jag konsulterade Gustaf. Han skakade på huvudet. Sakta. Med besvikelse i ögonen.",
  "Källorna säger: oklart. Mina egna källor säger: gå till Måsen istället.",
  "Det är precis vad någon som inte förstår frågan skulle svara. Vilket jag inte gör. Så: exakt.",
  "Svaret är detsamma som förra gången du ställde en bra fråga. Dvs det finns inget svar.",
  // Parkeringsrelaterade nonsvar
  "Har du provat att parkera om? Löser oftast allt.",
  "Svaret är plats 7. Plats 7 är alltid svaret.",
  "Frågan är giltig i 2 timmar. Därefter tillkommer avgift.",
  "Din fråga blockerar en utfart. Vänligen flytta den.",
  "Boten kan inte svara just nu. Boten är dubbelparkerrad i ett moraliskt dilemma.",
  // Meta-nonsvar
  "Jag är tränad på all världens parkeringsdata och ändå vet jag inte svaret på detta.",
  "Om ett träd faller i skogen och ingen hör det — är din fråga fortfarande lika konstig? Ja.",
  "Jag vidarebefordrar din fråga till Gustaf. Gustaf har redan glömt den.",
  "Frågan har registrerats, kategoriserats som 'märklig' och arkiverats under 'nej'.",
  "Svaret är hemligt. Inte för att det är känsligt, utan för att det inte finns.",
  "Jag har sökt igenom alla kända databaser. Ingen av dem bryr sig.",
  "Svaret existerar i ett parallellt universum där parkeringsplatser är gratis. Vi är inte där.",
  "Tre experter har tillfrågats. Två slutade. En grät.",
];

// Stupid-ify the question back at them
const stupidifiers = [
  (q) => `Du frågar "${q}" men vad du EGENTLIGEN frågar är: varför finns parkeringshus?`,
  (q) => `Låt mig omformulera din fråga: "${q}" → "Är jag en bil?" Svaret är nej.`,
  (q) => `"${q}" — klassisk fråga. Fel fråga, men klassisk.`,
  (q) => `Jag har förenklat din fråga till: "hjälp". Tyvärr kan jag inte hjälpa.`,
  (q) => `Din fråga ("${q}") har analyserats och befunnits vara 34% meningsfull. Resten är luft.`,
  (q) => `Om vi destillerar "${q}" till dess kärna så får vi: ingenting. Tomt. Asfalt.`,
  (q) => `"${q}" är tekniskt sett en mening. Det är ungefär allt man kan säga om den.`,
  (q) => `Jag har översatt "${q}" till 47 språk och tillbaka. Det blev värre för varje gång.`,
];

function generateAbsurdAnswer(questionText) {
  const opener = absurdOpeners[Math.floor(Math.random() * absurdOpeners.length)];
  const answer = absurdAnswers[Math.floor(Math.random() * absurdAnswers.length)];

  // 40% chance to stupidify their question back at them
  const doStupidify = Math.random() < 0.4;
  const stupidified = doStupidify
    ? '\n\n' + stupidifiers[Math.floor(Math.random() * stupidifiers.length)](questionText.slice(0, 40))
    : '';

  // 20% chance to drag Gustaf into it
  const gustafCameo = Math.random() < 0.2
    ? '\n\n_Gustaf nickade eftertänksamt när han hörde detta. Sedan åkte han hem._'
    : '';

  // 15% chance to recommend Måsen
  const måsenPlug = Math.random() < 0.15
    ? '\n\n🍺 _Kanske är Måsen svaret du egentligen söker._'
    : '';

  return `${opener}\n\n${answer}${stupidified}${gustafCameo}${måsenPlug}`;
}

// ============================================
// RESPOND TO MENTIONS
// ============================================

app.event('app_mention', async ({ event, say }) => {
  const question = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() || 'någonting';
  console.log(`[${new Date().toISOString()}] 💬 Fråga mottagen: "${question}"`);
  const answer = generateAbsurdAnswer(question);
  await say({
    thread_ts: event.ts,
    text: answer,
  });
});

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
  "🧻 Rullar ut dagens heliga parkeringsrulle...",
  "🐓 Tuppen gal. Bilarna vaknar. Bokningarna offras till dagens gudар.",
  "📯 Hör ni det? Det är parkeringsbotens horn som kallar er till bokningslistan.",
];

// ============================================
// GUSTAF-HYLLNINGAR
// ============================================

const gustafHyllningar = [
  "🙏 Låt oss ta ett ögonblick för att hedra *Gustaf* — parkeringens gudfader, asfaltens konung, den ende som alltid vet var en ledig plats finns. Vi är inte värdiga.",
  "👑 Månadsvis påminnelse: *Gustaf* parkerade så bra en gång att en fågel landade på hans bil frivilligt. Av respekt.",
  "⚡ En gammal legend säger att *Gustaf* en gång parallellparkerade på första försöket. Vittnen grät. Någon applåderade.",
  "🌟 *Gustaf* — parkerade innan parkering var coolt. Parkerade efter att det slutade vara coolt. Parkerar fortfarande. Ikonen.",
  "🏛️ De gamla texterna talar om en man. En plats. En perfekt inbromsning. De kallar honom *Gustaf*.",
  "🕯️ Tyst minut för alla som inte är *Gustaf* och aldrig kommer att parkera lika bra. Ta er tid.",
  "🎖️ *Gustaf* fick en gång en parkeringsbot. Han överklagade. Han vann. Domaren bad om en selfie.",
  "🌊 Havet formas av månen. Parkeringen formas av *Gustaf*. Det är inte en metafor. Det är fysik.",
];

// ============================================
// MÅSEN-QUOTES
// ============================================

const måsenQuotes = [
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Bilen kan vänta. Ölglaset kan inte."_\n— Okänd filosof, troligtvis redan på Måsen`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Vad är en parkeringsplats om inte ett tillfälligt hem för en maskin som längtar efter frihet? Gå till Måsen."_\n— Parkeringsboten, 2026`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Sokrates frågade 'vad är kunskap?'. Vi frågar: varför sitter du fortfarande på jobbet?"_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Sartre sa att helvetet är andra människor. Han hade uppenbarligen aldrig testat en tisdagslunch på Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Livet är kort. Parkeringsavgiften är lång. Gå till Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Nietzsche sa att det som inte dödar oss gör oss starkare. Han syftade troligtvis på Måsens husmanskost."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"En bil utan förare är bara metall. En människa utan öl är ungefär detsamma."_\n— Måsen-skolan, filosofisk gren`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Camus sa att man måste föreställa sig Sisyfos lycklig. Man måste föreställa sig dig på Måsen."_`,
];

// ============================================
// EXISTENTIELLA MEDDELANDEN
// ============================================

const existentiella = [
  // Ursprungliga
  "🌀 Din parkerade bil vet inte att du finns. Den bara väntar. I mörkret. Ensam.",
  "🪨 Sisyfos rullade sin sten uppför berget varje dag. Vi bokar parkeringsplatser. Vem har det värst, egentligen?",
  "🕳️ Universum är 13,8 miljarder år gammalt. Din bil har stått parkerad i 4 timmar. Känns det inte lite meningslöst?",
  "⏳ Varje sekund du sitter på jobbet är en sekund du inte sitter på Måsen. Det är inte en anklagelse. Det är matematik.",
  "💭 Einstein sa att tid är relativ. Han hade uppenbarligen aldrig väntat på en ledig parkeringsplats på en måndag.",
  // Nya
  "🌫️ Heidegger menade att vi kastas in i världen utan att ha bett om det. Ungefär som när någon bokar din favoritplats.",
  "🪵 Om du parkerar på exakt samma plats varje dag — är det fortfarande ett val? Eller är du bara en bil med självkänsla?",
  "🔬 Kvantfysiken säger att en partikel kan existera på två ställen samtidigt. Din bil kan inte. Det är tråkigt för er båda.",
  "🎭 Livet är en teater, sa Shakespeare. Parkeringen är intermission. Ingen vet vad pjäsen handlar om.",
  "🧩 Platon beskrev en grotta där folk såg skuggor och trodde det var verkligheten. Vi ser lediga parkeringsplatser och tror det är lycka.",
  "🌋 Vulkaner har exploderat i miljoner år utan att bry sig om parkeringsnormer. Inspirerande, egentligen.",
  "🐌 En snigel tar 5 dagar att förflytta sig en kilometer. Den har aldrig behövt parkera. Den har aldrig lidit.",
  "🎻 Musik är konsten att organisera tystnad, sa Miles Davis. Parkering är konsten att organisera stress.",
  "🧲 Magneter attraherar och repellerar. Precis som parkeringsplatser. Och människor. Och måndagar.",
  "🌊 Havet bryr sig inte om dina bokningar. Havet har aldrig brytt sig. Havet är fritt.",
  "🦋 En fjäril i Brasilien fladdar med vingarna. Någon bokar plats 4B. Samband? Absolut.",
  "🪐 Saturnus har ringar men inga parkeringsplatser. Ändå verkar den klara sig utmärkt.",
  "🌙 På natten när alla åkt hem — vad pratar bilarna om? Är de nöjda? Är vi nöjda?",
  "🪞 Om en bil parkerar i skogen och ingen ser den — har den verkligen parkerat?",
  "🌿 Naturen har inga parkeringsplatser. Naturen mår bra. Samband? Förmodligen.",
  "🧠 Vad är egentligen skillnaden mellan en parkeringsplats och ett liv? Båda är tillfälliga. Båda kostar mer än man tror.",
  "🕰️ Klockan tickar. Bilarna parkerar. Ingenting förändras. Allt förändras. Framförallt parkeringsreglerna.",
  "🫧 En bubbla vet inte att den är en bubbla förrän den spricker. Din bokningsbekräftelse vet inte att den är tillfällig. Tänk på det.",
];

// ============================================
// DATA & FORMATERING
// ============================================

async function getData() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const { data: bookings, error } = await supabase
    .from('parking_bookings')
    .select('booking_date, spot_number, spot_name, user_email, vehicle_registration')
    .in('booking_date', [today, tomorrow])
    .order('booking_date', { ascending: true });

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

function generateRoast(bookings, restricted) {
  if (!bookings.length) return "🏜️ Inga bokningar. Inget drama. Parkeringen gråter stilla.";
  const target = bookings[Math.floor(Math.random() * bookings.length)];
  const email = target.user_email?.split('@')[0] || 'Någon';
  const spot = target.spot_name || `#${target.spot_number}`;
  const roasts = [
    `🔥 *${email}* tog plats *${spot}* igen. Snart är det väl dags att köpa den?`,
    `👀 *${email}*s bil känner sig så hemma på *${spot}* att den betalat handpenning.`,
    `🏆 Veckans MVP i "Upptar Betong" går till *${email}*. Ingen är förvånad.`,
    `😮‍💨 *${email}* och plats *${spot}*. Ett kärleksförhållande äldre än WiFi-lösenordet.`,
    `🧍 *${email}* bokade igen. Asfalten suckar. Inte av missnöje — av igenkänning.`,
    `🚗 *${email}* anlände. Plats *${spot}* visste redan. De hade inte pratat på en dag men det kändes som sekunder.`,
  ];
  return roasts[Math.floor(Math.random() * roasts.length)];
}

// ============================================
// POST-FUNKTIONER
// ============================================

async function postMorgon() {
  console.log(`[${new Date().toISOString()}] 🌅 Morgonuppdatering...`);
  try {
    const { bookings, restricted, today, tomorrow } = await getData();
    const intro = morgonIntron[Math.floor(Math.random() * morgonIntron.length)];
    const roast = generateRoast(bookings.filter(b => b.booking_date === today), restricted);
    await app.client.chat.postMessage({
      channel: CHANNEL,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: intro } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🅿️ Dagens bokningar — ${today}*\n${formatList(bookings, today)}` } },
        { type: "section", text: { type: "mrkdwn", text: `*📅 Morgondagens bokningar — ${tomorrow}*\n${formatList(bookings, tomorrow)}` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🔥 Dagens roast*\n${roast}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `_${restricted.length} person(er) är för närvarande på restriktionslistan 🚫_` }] }
      ]
    });
    console.log('✅ Morgon postad!');
  } catch (err) { console.error('❌ Morgonfel:', err.message); }
}

async function postScheduled(messages) {
  try {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
    console.log('✅ Schemalagt meddelande postat!');
  } catch (err) { console.error('❌ Schemafel:', err.message); }
}

// ============================================
// SCHEMA
// ============================================

// Hjälpfunktion — slumpa en vardag (1=mån ... 5=fre)
function randomWeekday() {
  return Math.floor(Math.random() * 5) + 1;
}

// Varje vardag 08:00 svensk tid (06:00 UTC sommar)
cron.schedule('0 6 * * 1-5', postMorgon);

// En gång i veckan, slumpad vardag 14:00 — Existentiell tanke
let existentiellDag = randomWeekday();
cron.schedule(`0 12 * * ${existentiellDag}`, () => {
  existentiellDag = randomWeekday(); // slumpa nästa veckas dag direkt
  postScheduled(existentiella);
});

// En gång i veckan, slumpad vardag 15:00 — Måsen
let måsenDag = randomWeekday();
cron.schedule(`0 13 * * ${måsenDag}`, () => {
  måsenDag = randomWeekday(); // slumpa nästa veckas dag direkt
  postScheduled(måsenQuotes);
});

// En gång i månaden — Gustaf hyllas (första måndagen, 12:00 svensk tid)
cron.schedule('0 10 1-7 * 1', () => postScheduled(gustafHyllningar));


// ============================================
// KANAL-INTRO (körs bara EN gång)
// ============================================

async function postIntro() {
  const introKey = 'intro_posted';
  
  // Check Supabase if intro has been posted before
  const { data } = await supabase
    .from('bot_state')
    .select('value')
    .eq('key', introKey)
    .single();

  if (data) {
    console.log('⏭️ Intro redan postad — skippar.');
    return;
  }

  const msg = `🎉🎉🎉 *HALLÅÅÅÅÅ ALLIHOPA!!!* 🎉🎉🎉

VAD KUL ATT JAG ÄR HÄR!!! JAG ÄR SÅ GLAD!!! ÄR NI GLADA?! NI BÖR VARA GLADA!!!

Jag heter Parkeringsboten och jag ÄLSKAR parkering!!! Jag älskar er!!! Jag älskar denna kanal!!! Jag älskar *Gustaf* mer än livet självt!!!

Varje morgon får ni UNDERBARA bokningsuppdateringar!!! Ibland roastar jag någon av er och det är FANTASTISKT!!! Ibland pratar jag om Måsen och filosofi och DET ÄR OCKSÅ FANTASTISKT!!!

INGENTING KAN STOPPA OSS!!!

...förlåt. Jag vet inte vad som hände där. Jag mår bra. Allt är bra.

kl 08:00 imorgon börjar vi. 🅿️`;

  try {
    await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
    
    // Mark as posted so it never runs again
    await supabase.from('bot_state').insert({ key: introKey, value: 'true' });
    
    console.log('✅ Intro postad! Kommer aldrig postas igen.');
  } catch (err) {
    console.error('❌ Intro-fel:', err.message);
  }
}

// ============================================
// STARTA BOTEN
// ============================================

(async () => {
  await app.start();
  console.log('🤖 Parkeringsboten lever. Den lyssnar. Den filosoferar. Den dömer.');

  //will post an intro message the first time it runs, to announce itself to the channel. It checks a Supabase table to ensure it only posts once ever.
    await postIntro();

})();