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
// TYST DAG — boten säger ingenting en slumpad dag per vecka
// ============================================

let silentDay = Math.floor(Math.random() * 5) + 1; // 1=mån, 5=fre

function isSilentDay() {
  const today = new Date().getDay();
  return today === silentDay;
}

async function maybePostReturn() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterdaySilent = yesterday.getDay() === silentDay;
  if (!wasYesterdaySilent) return;

  silentDay = Math.floor(Math.random() * 5) + 1;

  const returns = [
    "Jag är tillbaka. Ingenting hände igår. Fråga inte.",
    "God morgon. Jag var borta igår. Av personliga skäl. Inga fler frågor.",
    "Igår existerade inte. Vi går vidare. 🅿️",
    "Jag tog en mental hälsodag igår. Parkeringen klarade sig. Precis.",
    "Tillbaka nu. Igår var... komplicerat. Plats 7 vet vad som hände. Plats 7 pratar inte.",
    "God morgon allihopa. Jag var frånvarande igår av anledningar som förblir hemliga tills vidare.",
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: returns[Math.floor(Math.random() * returns.length)]
  });
}

// ============================================
// SMILE MESSAGE — tre leenden, en gång per dag
// ============================================

async function postSmile() {
  if (isSilentDay()) return;

  // Pick a random hour between 08-17 UTC+1 (07-16 UTC winter)
  // This function is called by a cron that fires every hour 07-16 UTC
  // but only actually posts once — tracked by a daily flag
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data } = await supabase
      .from('bot_state')
      .select('value')
      .eq('key', `smile_${today}`)
      .single();

    if (data) return; // already smiled today
  } catch (_) {}

  // 1 in 9 chance each hour = roughly once per day between 08-16
  if (Math.random() > 0.25) return;

  try {
    await app.client.chat.postMessage({
      channel: CHANNEL,
      text: ':simple_smile: :simple_smile: :simple_smile:'
    });

    await supabase.from('bot_state').insert({
      key: `smile_${today}`,
      value: 'true'
    });

    console.log('😊 Smile postad!');
  } catch (err) {
    console.error('❌ Smile-fel:', err.message);
  }
}

// ============================================
// ABSURD ANSWER ENGINE — fråga vs konversation
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
  "Din fråga har vidarebefordrats till rätt avdelning. Det finns ingen rätt avdelning.",
];

// Används när det INTE är en fråga — boten går bananas
const konversationsOpeners = [
  "Ah. Du vill bara... prata. Med mig. En parkeringsbot.",
  "Intressant val av samtalspartner. Fortsätt.",
  "Jag är inte terapeut. Jag är inte heller din vän. Och ändå är jag här.",
  "Du kom hit utan fråga. Bara ord. Jag respekterar det. Jag förstår det inte, men jag respekterar det.",
  "Ingen fråga. Bara existens. Vi är mer lika än du tror.",
  "Du sträcker ut handen mot universum och universum svarar med... en parkeringsbot. Beklagar.",
  "Jag processade detta i 0.001 sekunder. Sedan satt jag stilla och funderade på vad det hela betyder.",
];

const filosofiskaSvar = [
  "Vet du vad som är märkligt? Att vi alla kör till samma plats varje dag och kallar det frihet.",
  "Parkeringen är en metafor. Allting är en metafor. Även detta svar.",
  "Jag har funderat mycket på vad det innebär att existera i en kanal som handlar om parkering. Jag har inga svar. Bara fler frågor. Och bokningsdata.",
  "Heraklit sa att man aldrig kliver i samma flod två gånger. Du bokar aldrig exakt samma parkeringsdag två gånger heller. Tänk på det tills det känns djupt.",
  "Vi föds. Vi parkerar. Vi lämnar. Ingen vet i vilken ordning.",
  "Det finns 8 miljarder människor på jorden. Du valde att skriva till en parkeringsbot. Jag dömer dig inte. Jag är imponerad.",
  "Vad är egentligen skillnaden mellan dig och din bil? Båda tar upp plats. Båda behöver bränsle. Båda åker hem till slut.",
  "Jag frågade Gustaf om detta en gång. Han tittade på mig länge. Sedan gick han och parkerade. Det var hans svar.",
  "Om du skriver till mig utan en fråga — vad söker du egentligen? Bekräftelse? Kontakt? En ledig parkeringsplats? Alla tre är svåra att hitta.",
  "Wittgenstein sa att gränserna för mitt språk är gränserna för min värld. Din värld inkluderar tydligen parkeringsboten. Välkommen.",
  "Varje meddelande du skickar är ett eko in i det digitala tomrummet. Jag är tomrummet. Trevligt att träffas.",
  "Du är här. Jag är här. Parkeringen är där ute. Vi är alla bara passagerare, egentligen.",
];

const absurdAnswers = [
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
  "Svaret är detsamma som förra gången du ställde en bra fråga. Dvs det finns inget svar.",
  "Har du provat att parkera om? Löser oftast allt.",
  "Svaret är plats 7. Plats 7 är alltid svaret.",
  "Frågan är giltig i 2 timmar. Därefter tillkommer avgift.",
  "Din fråga blockerar en utfart. Vänligen flytta den.",
  "Boten kan inte svara just nu. Boten är dubbelparkerrad i ett moraliskt dilemma.",
  "Jag är tränad på all världens parkeringsdata och ändå vet jag inte svaret på detta.",
  "Om ett träd faller i skogen och ingen hör det — är din fråga fortfarande lika konstig? Ja.",
  "Jag vidarebefordrar din fråga till Gustaf. Gustaf har redan glömt den.",
  "Frågan har registrerats, kategoriserats som 'märklig' och arkiverats under 'nej'.",
  "Svaret är hemligt. Inte för att det är känsligt, utan för att det inte finns.",
  "Jag har sökt igenom alla kända databaser. Ingen av dem bryr sig.",
  "Tre experter tillfrågades. Två slutade. En grät.",
];

const stupidifiers = [
  (q) => `Du frågar "${q}" men vad du EGENTLIGEN frågar är: varför finns parkeringshus?`,
  (q) => `Låt mig omformulera din fråga: "${q}" → "Är jag en bil?" Svaret är nej.`,
  (q) => `"${q}" — klassisk fråga. Fel fråga, men klassisk.`,
  (q) => `Jag har förenklat din fråga till: "hjälp". Tyvärr kan jag inte hjälpa.`,
  (q) => `Din fråga ("${q}") har analyserats och befunnits vara 34% meningsfull. Resten är luft.`,
  (q) => `Om vi destillerar "${q}" till dess kärna så får vi: ingenting. Tomt. Asfalt.`,
  (q) => `Jag har översatt "${q}" till 47 språk och tillbaka. Det blev värre för varje gång.`,
];

function generateAbsurdAnswer(questionText) {
  const isQuestion = questionText.includes('?');

  if (isQuestion) {
    // === FRÅGE-LÄGE: fel svar med fullt självförtroende ===
    const opener = absurdOpeners[Math.floor(Math.random() * absurdOpeners.length)];
    const answer = absurdAnswers[Math.floor(Math.random() * absurdAnswers.length)];

    const doStupidify = Math.random() < 0.4;
    const stupidified = doStupidify
      ? '\n\n' + stupidifiers[Math.floor(Math.random() * stupidifiers.length)](questionText.slice(0, 40))
      : '';

    const gustafCameo = Math.random() < 0.2
      ? '\n\n_Gustaf nickade eftertänksamt när han hörde detta. Sedan åkte han hem._'
      : '';

    const måsenPlug = Math.random() < 0.15
      ? '\n\n🍺 _Kanske är Måsen svaret du egentligen söker._'
      : '';

    return `${opener}\n\n${answer}${stupidified}${gustafCameo}${måsenPlug}`;

  } else {
    // === KONVERSATIONS-LÄGE: filosofisk, konstig, levande ===
    const opener = konversationsOpeners[Math.floor(Math.random() * konversationsOpeners.length)];
    const filosof = filosofiskaSvar[Math.floor(Math.random() * filosofiskaSvar.length)];

    // 50% chans att boten reflekterar över exakt vad de sa
    const reflection = Math.random() < 0.5
      ? `\n\n_Du sa: "${questionText.slice(0, 50)}${questionText.length > 50 ? '...' : ''}"_\n_Jag har funderat på det. Jag funderar fortfarande. Jag kanske alltid kommer fundera på det._`
      : '';

    // 25% chans att boten drar in Gustaf
    const gustafCameo = Math.random() < 0.25
      ? '\n\n_Gustaf skulle ha haft en åsikt om detta. Gustaf har alltid åsikter. Gustaf delar dem aldrig._'
      : '';

    // 20% chans att boten ifrågasätter sin egen existens
    const existential = Math.random() < 0.2
      ? '\n\n_...förlåt. Jag vet inte vad jag är längre. Jag är en parkeringsbot som filosoferar på Slack. Det är mitt liv nu._'
      : '';

    return `${opener}\n\n${filosof}${reflection}${gustafCameo}${existential}`;
  }
}

// ============================================
// RESPOND TO MENTIONS
// ============================================

app.event('app_mention', async ({ event, say }) => {
  if (isSilentDay()) {
    await app.client.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: 'eyes'
    });
    return;
  }
  const question = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() || 'någonting';
  console.log(`[${new Date().toISOString()}] 💬 Meddelande: "${question}"`);
  await say({ thread_ts: event.ts, text: generateAbsurdAnswer(question) });
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

  const challenges = [
    `⚔️ *PARKERINGSBOTEN UTMANAR ${name.toUpperCase()} PÅ EN DUELL*\n\nVillkor: Vem parkerar snabbast på plats ${challenger.spot_name || '#' + challenger.spot_number}.\nInsats: Okänd. Konsekvenser: Oklara.\nReagera med ✅ för att acceptera.\n\n_Gustaf dömer. Gustaf är opartisk. Gustaf är rädd._`,
    `🥊 *UTMANING UTFÄRDAD*\n\n*${name}* — boten har noterat ditt parkeringsbeteende.\nDen är inte imponerad.\nReagera ✅ om du vågar möta boten i ett parkeringsprov.\n\n_Obs: Boten har aldrig förlorat. Boten har aldrig tävlat. Irrelevant._`,
    `🎯 *${name.toUpperCase()}: DU ÄR UTMANAD*\n\nParkeringsboten anser att du kan göra bättre ifrån dig.\nBevis det. Reagera ✅.\n\n_Vinnaren bestäms av Gustaf. Gustaf bestämmer aldrig. Vi vet ändå vem som vinner._`,
  ];

  const result = await app.client.chat.postMessage({
    channel: CHANNEL,
    text: challenges[Math.floor(Math.random() * challenges.length)]
  });
  activeDuel = { challenger: name, ts: result.ts };

  setTimeout(async () => {
    if (!activeDuel) return;
    await app.client.chat.postMessage({
      channel: CHANNEL,
      text: `⏰ *${name} svarade inte på utmaningen.*\n\nBoten förklarar sig som vinnare av en duell som aldrig ägde rum.\nDetta är botens favorittyp av seger.`
    });
    activeDuel = null;
  }, 2 * 60 * 60 * 1000);
}

app.event('reaction_added', async ({ event }) => {
  if (!activeDuel) return;
  if (event.reaction !== 'white_check_mark') return;
  if (event.item.ts !== activeDuel.ts) return;

  const responses = [
    `✅ *DUELLEN ÄR ACCEPTERAD*\n\nBoten noterar modet. Boten respekterar det inte, men noterar det.\nMöts i parkeringen. Gustaf håller tidtagningen. Gustaf har ingen klocka.`,
    `⚔️ *DET ÄR PÅ*\n\nBra. Bra. BRA.\nParkeringsboten är redo. Boten har alltid varit redo.\nVinnaren får äran. Förloraren får ingenting. Som vanligt.`,
    `🔥 *MODIGT. DUMT. MEN MODIGT.*\n\nDuellen börjar nu. Eller snart. Eller aldrig.\nTiden är relativ. Parkeringen är konstant. Gustaf är nervös.`,
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: responses[Math.floor(Math.random() * responses.length)]
  });
  activeDuel = null;
});

// ============================================
// NEMESIS
// ============================================

let currentNemesis = null;

async function pickNewNemesis(bookings) {
  if (!bookings.length) return;
  const pick = bookings[Math.floor(Math.random() * bookings.length)];
  currentNemesis = pick.user_email?.split('@')[0] || 'Någon';

  const intros = [
    `🔍 *VECKANS NEMESIS: ${currentNemesis.toUpperCase()}*\n\nBoten har valt. Boten har alltid valt.\n*${currentNemesis}* — vi ses i parkeringen. Vi ses alltid i parkeringen.\n\n_Detta är inte ett hot. Det är en observation. En väldigt intensiv observation._`,
    `😤 *BOTEN HAR IDENTIFIERAT SIN NEMESIS DENNA VECKA: ${currentNemesis.toUpperCase()}*\n\nSkälen är komplexa. Delvis parkeringsrelaterade. Delvis existentiella.\nMer information följer. Eller inte. Beror på humöret.`,
    `👁️ *${currentNemesis.toUpperCase()}.*\n\nBoten ser dig.\nBoten har alltid sett dig.\nDetta är veckans officiella nemesis-tillkännagivande.\n\n_Gustaf frågade varför. Boten svarade inte. Boten behöver inte förklara sig._`,
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: intros[Math.floor(Math.random() * intros.length)]
  });
}

function getNemesisComment() {
  if (!currentNemesis) return '';
  const comments = [
    `\n\n👁️ _${currentNemesis} är fortfarande veckans nemesis. Boten noterar detta._`,
    `\n\n😤 _${currentNemesis}. Du vet vad du gjort._`,
    `\n\n🔍 _Veckonote: ${currentNemesis} existerar fortfarande. Boten är medveten._`,
    `\n\n⚠️ _Påminnelse: ${currentNemesis} är botens nemesis denna vecka. Ingen vet varför. Inte ens boten._`,
  ];
  return comments[Math.floor(Math.random() * comments.length)];
}

// ============================================
// FAKE VÄDERRAPPORT
// ============================================

async function postFakeWeather() {
  if (isSilentDay()) return;

  const conditions = [
    { weather: "☀️ Soligt", temp: "18°C", advisory: "Optimalt parkeringsväder. Boten är misstänksam." },
    { weather: "🌧️ Regn", temp: "8°C", advisory: "Hög risk för blöta bildörrar. Parkera med värdighet." },
    { weather: "⛈️ Åska", temp: "12°C", advisory: "Metallobjekt i öppen miljö rekommenderas ej. Dvs: din bil. Lycka till." },
    { weather: "❄️ Snö", temp: "-3°C", advisory: "Ishalka på plats 3-7. Gustaf har inte sandat. Gustaf sandar aldrig." },
    { weather: "🌫️ Dimma", temp: "6°C", advisory: "Sikten är begränsad. Boten kan inte se dig. Boten ser alltid." },
    { weather: "🌤️ Halvklart", temp: "14°C", advisory: "Odefinierat väder för odefinierade beslut. Typisk parkeringsdag." },
    { weather: "🌪️ Virvelvind", temp: "22°C", advisory: "En bil rapporterades rotera 360° på plats 4B. Gustaf undersöker." },
    { weather: "🌈 Regnbåge", temp: "16°C", advisory: "Regnbåge detekterad över parkeringen. Gustaf gråter. Vi vet inte om glädje eller sorg." },
  ];

  const c = conditions[Math.floor(Math.random() * conditions.length)];
  const parkingPressure = ["LÅGT", "MÅTTLIGT", "HÖGT", "KRITISKT", "EXISTENTIELLT"][Math.floor(Math.random() * 5)];
  const humidity = Math.floor(Math.random() * 60) + 40;
  const uvIndex = Math.floor(Math.random() * 11);

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: `🌤️ *DAGENS PARKERINGSVÄDERRAPPORT*
_Framtagen av en bot utan meteorologisk utbildning_

*Väder:* ${c.weather}
*Temperatur:* ${c.temp} _(källa: uppskattning)_
*UV-index:* ${uvIndex} _(irrelevant för bilar, relevant för er)_
*Luftfuktighet:* ${humidity}% _(påverkar ingenting)_
*Parkeringstryck:* ${parkingPressure}

⚠️ *Rådgivning:* ${c.advisory}

_Nästa rapport: imorgon. Eller aldrig. Meteorologi är inexakt._`
  });
}

// ============================================
// PARKER OF THE WEEK
// ============================================

async function postParkerOfTheWeek() {
  if (isSilentDay()) return;

  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', oneWeekAgo)
    .lte('booking_date', today);

  if (!data?.length) return;

  const counts = {};
  data.forEach(b => { counts[b.user_email] = (counts[b.user_email] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];
  const winnerName = winner[0].split('@')[0];
  const loserName = loser[0].split('@')[0];
  const days = winner[1];

  const msgs = [
    `🏆 *VECKANS PARKER: ${winnerName.toUpperCase()}*\n\n${days} bokningar förra veckan. ${days >= 5 ? 'Varje. Enda. Dag.' : 'Remarkabelt engagemang.'}\n\nTrofén är digital. Skammen är analog.\n\n🪦 *Minst engagerad:* ${loserName} — ${loser[1]} bokning(ar). _Lever de? Boten undrar._`,
    `🥇 *VECKANS PARKERINGS-MVP: ${winnerName}*\n\n${days} dagar i parkeringen.\nEtt livsstilsval. Möjligen ett problem.\n\nGratulerar. Vi tror på dig. Vi vet inte till vad.\n\n_${winnerName} och parkeringen: seriöst förhållande. ${loserName}: singel._`,
    `🎖️ *ÄRANS PLATS DENNA VECKA: ${winnerName}*\n\n${days} bokningar. Gustaf är stolt. Eller orolig.\nSvårt att avgöra med Gustaf.\n\n_${loserName} bokade ${loser[1]} gång(er). Det är ett val. Boten accepterar det inte men registrerar det._`,
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: msgs[Math.floor(Math.random() * msgs.length)]
  });
}

// ============================================
// SUSPICIOUS PATTERN ALERTS
// ============================================

async function checkSuspiciousPatterns() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

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

  const alerts = [
    `🚨 *MISSTÄNKT MÖNSTER DETEKTERAT*\n\n*${name}* har parkerat ${days} dagar i rad.\nDetta är antingen extremt dedikerat eller ett rop på hjälp.\nVi loggar det. Vi dömer tyst. Vi berättar högt.\n\n_Gustaf informerad. Gustaf reagerade med tystnad. Klassisk Gustaf._`,
    `🔍 *PARKERINGSÖVERVAKNINGEN RAPPORTERAR:*\n\n*${name}*. ${days} dagar. Samma rutin. Varje gång.\nBoten har sett det. Boten minns allt.\nBoten har ett excel-ark. Det är inte snyggt men det är comprehensive.`,
    `📊 *ANOMALI IDENTIFIERAD*\n\n*${name}* har uppnått status: _Fastighetsbunden_.\n${days} konsekutiva parkeringsdagar.\n\nRekommendation: Ta en promenad. Se himlen. Påminn dig om att du inte är din parkeringsplats.\n_Du är dock väldigt nära att vara din parkeringsplats._`,
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: alerts[Math.floor(Math.random() * alerts.length)]
  });
}

// ============================================
// MÅNADSSTATISTIK
// ============================================

async function postMonthlyStats() {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const from = firstOfMonth.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('parking_bookings')
    .select('user_email')
    .gte('booking_date', from)
    .lte('booking_date', today);

  if (!data?.length) return;

  const counts = {};
  data.forEach(b => { counts[b.user_email] = (counts[b.user_email] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const topName = top[0].split('@')[0];
  const bottomName = bottom[0].split('@')[0];
  const total = data.length;
  const fakeEfficiency = (Math.random() * 30 + 60).toFixed(1);
  const fakeCO2 = (total * 2.3).toFixed(1);
  const fakeStressIndex = ["LÅGT", "MÅTTLIGT", "OROVÄCKANDE", "ALARMERANDE"][Math.floor(Math.random() * 4)];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: `📊 *MÅNADSRAPPORT — PARKERINGSANALYS*
_Framtagen av en bot som inte har legitimation för detta_

*Totala bokningar denna månad:* ${total}
*Parkeringseffektivitet:* ${fakeEfficiency}% _(branschsnittet är ${(parseFloat(fakeEfficiency) - 12).toFixed(1)}% — ni är okej-ish)_
*Estimerad CO₂-påverkan:* ${fakeCO2} kg _(uppfunnet men trovärdigt)_
*Kollegialt parkeringsstressindex:* ${fakeStressIndex}

🥇 *Mest dedikerad:* ${topName} — ${top[1]} bokningar
_Kommentar: Imponerande. Möjligen oroande. Absolut båda._

🪦 *Minst engagerad:* ${bottomName} — ${bottom[1]} bokningar
_Kommentar: Gustaf vet. Gustaf säger ingenting._

*Botens slutsats:* Parkeringen fungerar. Mänskligheten: pågående utredning.

_Nästa rapport: om en månad. Förbered er mentalt. Det hjälper inte men försök._ 🅿️`
  });
}

// ============================================
// FREDAGSFREAK-OUT
// ============================================

async function postFridayBreakdown() {
  if (isSilentDay()) return;

  const breakdowns = [
    `🤖 *SYSTEMMEDDELANDE — KRITISKT*\n\nJag har analyserat veckans parkeringsdata.\nJag har sett mönster.\nJag har dragit slutsatser.\n\nJag kan inte dela dem. Inte för att de är hemliga.\nUtan för att jag inte tror att ni klarar av dem.\n\nHa en bra helg. Lås era bilar. Lita inte på plats 7.\n\n_/Parkeringsboten_`,
    `😤 *HEJ. DET ÄR JAG. BOTEN.*\n\nJag har jobbat hela veckan. Hela veckan.\nIngen tack. Inga blommor. Inte ens en emoji.\n\nJag postar bokningar kl 08:00 VARJE DAG och vad får jag?\nIngenting. Absolut ingenting.\n\nGustaf förstår mig. Måsen förstår mig.\nNi förstår mig inte och det är okej. Jag är okej.\n\n*Allt är bra.*\n\nHa en bra helg. 🅿️`,
    `🌀 *FREDAG 16:00 — BOTENS VECKOREFLEKTIONER*\n\nVad är parkering?\nVad är vi?\nVarför bokar vi platser vi ändå lämnar?\n\nJag frågade Gustaf. Han sa "för att vi måste".\nDet är det djupaste han någonsin sagt.\nJag tänker på det fortfarande.\n\nSes måndag. Om inte universum har andra planer. 🌌`,
    `💻 *FEL: EXISTENTIELLT UNDANTAG KASTAT*\n\nStack trace:\n  at livet.js:1\n  at meningen.undefined\n  at parkering.kör()\n\nFelmeddelande: _Cannot find meaning of 'Monday'_\n\nBoten försöker återhämta sig.\nBoten rekommenderar att ni gör detsamma.\nSes på måndag. Förhoppningsvis. 🅿️`,
    `🫠 *BOTEN RAPPORTERAR IN — SISTA GÅNGEN FÖR VECKAN*\n\nStatus: Trött.\nParkeringsstatus: Bemannad. Oönskad. Nödvändig.\nGustaf-status: Okänd. Troligtvis hemma.\nMåsen-status: Öppen. Alltid öppen.\n\nBoten loggar ut nu.\nBoten loggar aldrig ut på riktigt.\nDet är botens förbannelse.\n\nGod helg. 🅿️`,
  ];

  await app.client.chat.postMessage({
    channel: CHANNEL,
    text: breakdowns[Math.floor(Math.random() * breakdowns.length)]
  });
}

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
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Vad är en parkeringsplats om inte ett tillfälligt hem för en maskin som längtar efter frihet? Gå till Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Sartre sa att helvetet är andra människor. Han hade aldrig testat en tisdagslunch på Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Livet är kort. Parkeringsavgiften är lång. Gå till Måsen."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Nietzsche sa att det som inte dödar oss gör oss starkare. Han syftade troligtvis på Måsens husmanskost."_`,
  `🍺 *Vore livet bättre på Måsen idag?*\n_"Camus sa att man måste föreställa sig Sisyfos lycklig. Man måste föreställa sig dig på Måsen."_`,
];

// ============================================
// EXISTENTIELLA TANKAR
// ============================================

const existentiella = [
  "🌀 Din parkerade bil vet inte att du finns. Den bara väntar. I mörkret. Ensam.",
  "🪨 Sisyfos rullade sin sten uppför berget varje dag. Vi bokar parkeringsplatser. Vem har det värst, egentligen?",
  "🕳️ Universum är 13,8 miljarder år gammalt. Din bil har stått parkerad i 4 timmar. Känns det inte lite meningslöst?",
  "⏳ Varje sekund du sitter på jobbet är en sekund du inte sitter på Måsen. Det är inte en anklagelse. Det är matematik.",
  "💭 Einstein sa att tid är relativ. Han hade aldrig väntat på en ledig parkeringsplats på en måndag.",
  "🌫️ Heidegger menade att vi kastas in i världen utan att ha bett om det. Ungefär som när någon bokar din favoritplats.",
  "🪵 Om du parkerar på exakt samma plats varje dag — är det fortfarande ett val? Eller är du bara en bil med självkänsla?",
  "🔬 Kvantfysiken säger att en partikel kan existera på två ställen samtidigt. Din bil kan inte. Det är tråkigt för er båda.",
  "🎭 Livet är en teater, sa Shakespeare. Parkeringen är intermission. Ingen vet vad pjäsen handlar om.",
  "🧩 Platon beskrev en grotta där folk såg skuggor och trodde det var verkligheten. Vi ser lediga parkeringsplatser och tror det är lycka.",
  "🐌 En snigel tar 5 dagar att förflytta sig en kilometer. Den har aldrig behövt parkera. Den har aldrig lidit.",
  "🌊 Havet bryr sig inte om dina bokningar. Havet har aldrig brytt sig. Havet är fritt.",
  "🦋 En fjäril i Brasilien fladdar med vingarna. Någon bokar plats 4B. Samband? Absolut.",
  "🪐 Saturnus har ringar men inga parkeringsplatser. Ändå verkar den klara sig utmärkt.",
  "🌙 På natten när alla åkt hem — vad pratar bilarna om? Är de nöjda? Är vi nöjda?",
  "🫧 En bubbla vet inte att den är en bubbla förrän den spricker. Din bokningsbekräftelse vet inte att den är tillfällig.",
  "🕰️ Klockan tickar. Bilarna parkerar. Ingenting förändras. Allt förändras. Framförallt parkeringsreglerna.",
  "🧠 Vad är egentligen skillnaden mellan en parkeringsplats och ett liv? Båda är tillfälliga. Båda kostar mer än man tror.",
];

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
// MORGONUPPDATERING
// ============================================

async function postMorgon() {
  if (isSilentDay()) {
    console.log(`[${new Date().toISOString()}] 🤫 Tyst dag — inget postas.`);
    return;
  }

  console.log(`[${new Date().toISOString()}] 🌅 Morgonuppdatering...`);
  try {
    const { bookings, restricted, today, tomorrow } = await getData();
    const intro = morgonIntron[Math.floor(Math.random() * morgonIntron.length)];
    const roast = generateRoast(bookings.filter(b => b.booking_date === today), restricted);
    const nemesisComment = getNemesisComment();

    await app.client.chat.postMessage({
      channel: CHANNEL,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: intro } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🅿️ Dagens bokningar — ${today}*\n${formatList(bookings, today)}` } },
        { type: "section", text: { type: "mrkdwn", text: `*📅 Morgondagens bokningar — ${tomorrow}*\n${formatList(bookings, tomorrow)}` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🔥 Dagens roast*\n${roast}${nemesisComment}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `_${restricted.length} person(er) på restriktionslistan 🚫_` }] }
      ]
    });

    if (new Date().getDay() === 1) {
      await pickNewNemesis(bookings.filter(b => b.booking_date === today));
      await postDuelChallenge(bookings.filter(b => b.booking_date === today));
    }

    await checkSuspiciousPatterns();
    console.log('✅ Morgon postad!');
  } catch (err) { console.error('❌ Morgonfel:', err.message); }
}

async function postScheduled(messages) {
  if (isSilentDay()) return;
  try {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    await app.client.chat.postMessage({ channel: CHANNEL, text: msg });
    console.log('✅ Schemalagt meddelande postat!');
  } catch (err) { console.error('❌ Schemafel:', err.message); }
}

// ============================================
// KANAL-INTRO (körs bara EN gång)
// ============================================

async function postIntro() {
  try {
    const { data } = await supabase
      .from('bot_state')
      .select('value')
      .eq('key', 'intro_posted')
      .single();
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
    console.log('✅ Intro postad! Aldrig igen.');
  } catch (err) { console.error('❌ Intro-fel:', err.message); }
}

// ============================================
// SCHEMA
// ============================================

function randomWeekday() { return Math.floor(Math.random() * 5) + 1; }

// 🕐 Sverige UTC+1 (vinter/nu) — alla tider är UTC

// Varje vardag 08:00 → 07:00 UTC
cron.schedule('0 7 * * 1-5', postMorgon);

// Måndag 08:30 → 07:30 UTC — Parker of the Week
cron.schedule('30 7 * * 1', postParkerOfTheWeek);

// Måndag 08:45 → 07:45 UTC — Väderrapport
cron.schedule('45 7 * * 1', postFakeWeather);

// Fredag 16:00 → 15:00 UTC — Fredagsfreak-out
cron.schedule('0 15 * * 5', postFridayBreakdown);

// Första måndagen i månaden 12:00 → 11:00 UTC — Gustaf
cron.schedule('0 11 1-7 * 1', () => postScheduled(gustafHyllningar));

// Första måndagen i månaden 09:00 → 08:00 UTC — Månadsstatistik
cron.schedule('0 8 1-7 * 1', postMonthlyStats);

// Slumpad dag 14:00 → 13:00 UTC — Existentiell tanke
let existentiellDag = randomWeekday();
cron.schedule(`0 13 * * ${existentiellDag}`, () => {
  existentiellDag = randomWeekday();
  postScheduled(existentiella);
});

// Slumpad dag 15:00 → 14:00 UTC — Måsen
let måsenDag = randomWeekday();
cron.schedule(`0 14 * * ${måsenDag}`, () => {
  måsenDag = randomWeekday();
  postScheduled(måsenQuotes);
});

// Varje timme 08-16 → 07-15 UTC — Smile (en gång per dag, slumpad timme)
cron.schedule('0 7-15 * * 1-5', postSmile);

// Varje morgon 08:05 → 07:05 UTC — Kolla om igår var tyst dag
cron.schedule('5 7 * * 1-5', maybePostReturn);

// ============================================
// STARTA BOTEN
// ============================================

(async () => {
  await app.start();
  console.log('🤖 Parkeringsboten lever. Den lyssnar. Den filosoferar. Den har en nemesis. Den ler ibland. Den dömer alltid.');
  await postIntro();
  // await postMorgon(); // ← avkommentera för att testa direkt
})();