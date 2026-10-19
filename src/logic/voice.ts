import * as CarAnswer from './caranswer.ts';

/**
 * Voice commands in English, Hindi and Hinglish (port of Voice.java, 1.42): "FM 91.1", "call Mom",
 * "mummy ko call karo", "take me home", "घर ले चलो", "गाना चलाओ", "volume badhao", and questions
 * about the car ("how far today?", "कितना पेट्रोल है"). Anything that isn't a command is treated as
 * a place to search for on the map. parse() has no React Native types, so it is unit-tested;
 * MicButton listens and acts on what it returns.
 */

export interface Command {
  kind: string;
  arg: string;
}

/** "fm:91.1", "view360": the Java Command.toString(), which the tests compare against. */
export function str(c: Command | null): string {
  return c == null ? 'null' : c.kind + (c.arg === '' ? '' : ':' + c.arg);
}

const c = (kind: string, arg?: string | null): Command => ({ kind, arg: arg == null ? '' : arg.trim() });

const has = (s: string, regex: string) => new RegExp(regex).test(s);

/** Devanagari digits to 0–9, lower case, single spaces, "91 point 1" → "91.1". */
export function normalise(s: string): string {
  let b = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    b += code >= 0x966 && code <= 0x96f ? String.fromCharCode(48 + code - 0x966) : ch;
  }
  const t = b.toLowerCase().replace(/[?!,।]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.replace(/(\d+) ?(point|पॉइंट|पॉइन्ट|dot) ?(\d)/g, '$1.$3');
}

const RADIO = '(fm|f m|एफएम|एफ एम|एफ़एम|radio|रेडियो)';
const GO = '(take me|navigate|^go |drive to|directions to|chalo|le chalo|ले चलो|चलो|jana hai|जाना है|जाना)';

export function parse(heard: string | null | undefined): Command | null {
  if (heard == null) return null;
  const s = normalise(heard);
  if (s === '') return null;

  // FM at a frequency: "fm 91.1", "radio 98.3 lagao", "91.1 एफएम"
  let m = new RegExp(RADIO + '\\D{0,14}?(\\d{2,3}(\\.\\d)?)').exec(s);
  if (m) return c('fm', freq(m[2]));
  m = new RegExp('(\\d{2,3}\\.\\d) ?' + RADIO).exec(s);
  if (m) return c('fm', freq(m[1]));

  // calls: "call mom", "phone 98450 12345", "mummy ko call karo", "पापा को फोन लगाओ"
  m = /^(call|phone|dial|ring)( to)? (.+)$/.exec(s);
  if (m) return c('call', strip(m[3]));
  m = /^(.+?) (ko|को) (call|phone|फोन|फ़ोन|कॉल|kol)/.exec(s);
  if (m) return c('call', strip(m[1]));

  // parking, dashcam, waterlogging, service centre, sharing the drive
  if (has(s, '(where (did i|i) park|where is (my|the) car|gaadi kaha|गाड़ी कहा|गाड़ी कहाँ|parking spot)')) return c('park');
  if (has(s, '(save (the )?(clip|video)|dashcam|डैशकैम)')) return c('clip');
  if (has(s, '(waterlog|water logging|water logged|paani bhara|पानी भरा|flooded)')) return c('flood');
  if (has(s, '(service cent|service station|workshop|सर्विस सेंटर|सर्विस सेन्टर)')) return c('service');
  if (has(s, '(share (my |the )?(trip|drive|location|ride)|location bhejo|लोकेशन भेजो)')) return c('share');
  if (has(s, '(parking (timer|reminder|ends)|parking (for|ke liye)|पार्किंग टाइमर)')) return c('parkTimer');
  if (has(s, '(split|hisaab|hisab|हिसाब|बाँट|बांट|share (the )?(cost|petrol|fuel|toll))')) return c('split');
  if (has(s, '(hotspot|wi-?fi|wifi|वाईफाई|वाई-फाई)')) return c('hotspot');
  if (has(s, '(weekly report|week report|this week|हफ्ते)')) return c('weekly');
  if (has(s, '(parking photo|parking picture|photo of (the )?parking)')) return c('parkPhoto');
  if (has(s, '(air quality|\\baqi\\b|pollution(?! (certificate|papers|check))|प्रदूषण|hawa kaisi)')) return c('aqi');
  // documents, fog mode, children's games
  if (has(s, '(documents|papers|show (the |my )?(rc|insurance|puc|licence|license)|kagaz|kaagaz|कागज|कागज़|डॉक्यूमेंट)')) return c('docs');
  if (has(s, '(fog|kohra|कोहरा|धुंध|dhundh)')) return c('fog');
  if (has(s, '(kids|games|game|bachche|bachchon|बच्चों|खेल|khel)')) return c('kids');
  // cab drivers: the fare meter, the day's earnings, the Cab menu
  if (has(s, '(\\bmeter\\b|मीटर)')) return c('meter', has(s, '(stop|band|बंद|khatam|ख़त्म|खत्म|end|off)') ? 'stop' : 'start');
  if (has(s, '(earnings|kamai|kamaai|कमाई|kitna kamaya|कितना कमाया|how much (did i|have i) (earn|made))')) return c('earnings');
  if (has(s, '(cab menu|taxi menu|कैब)')) return c('cab');
  if (has(s, "(\\b360\\b|three sixty|bird'?s eye|तीन सौ साठ)")) return c('view360');
  // the news: "read the news", "headlines", "aaj ki khabar", "समाचार सुनाओ"
  if (has(s, '(\\bnews\\b|headlines|khabar|khabre|khabren|samachar|समाचार|खबर|ख़बर|न्यूज़|न्यूज)')) return c('news');

  // questions about the car: fuel, engine, faults, battery, today's distance
  const ask = CarAnswer.topic(s);
  if (ask != null) return c('ask', ask);

  // volume
  if (has(s, '(volume|awaaz|awaz|आवाज़|आवाज)') || has(s, '^(louder|quieter|softer)')) {
    if (has(s, '(down|kam|कम|dheere|धीरे|धीमा|quieter|softer|low)')) return c('volDown');
    if (has(s, '(mute|band|बंद)')) return c('mute');
    return c('volUp');
  }

  // music and radio on, next, previous, stop
  if (has(s, '^(next|agla|अगला|aage|आगे)( (song|gaana|गाना|station|track|channel))?$') || has(s, '^(next song|next station|अगला गाना)'))
    return c('next');
  if (has(s, '^(previous|pichla|पिछला|back|peeche)( (song|gaana|गाना|station|track|channel))?$')) return c('prev');
  if (has(s, '^(pause|stop|ruko|रुको|रोको|band karo|बंद करो|बंद)')) return c('pause');
  if (has(s, RADIO) && !has(s, GO)) return c('fm');
  if (has(s, '(music|gaana|gana|गाना|गाने|song|songs|संगीत|म्यूजिक|म्यूज़िक|bajao|बजाओ)')) return c('music');

  // places: home, office, petrol pump, a break, or anywhere by name
  const go = has(s, GO) || has(s, '^(navigate|directions)');
  if (has(s, '(^| )(home|ghar|घर)( |$)') && (go || s.split(' ').length <= 2)) return c('home');
  if (has(s, '(office|ऑफिस|ऑफ़िस|daftar|दफ्तर|दफ़्तर)') && (go || s.split(' ').length <= 2)) return c('office');
  if (has(s, '(petrol|पेट्रोल|fuel|diesel|cng)')) return c('fuel');
  if (has(s, '(dhaba|ढाबा|rest stop|break|chai|चाय|tea|coffee)')) return c('rest');
  m = /^(take me to|navigate to|go to|drive to|directions to|navigate) (.+)$/.exec(s);
  if (m) return c('search', m[2]);
  m = /^(.+?) (le chalo|ले चलो|chalo|चलो|jana hai|जाना है|जाना)$/.exec(s);
  if (m) return c('search', m[1]);
  return c('search', s);
}

/** "911" heard for 91.1; always one decimal. */
export function freq(f: string): string {
  let v = parseFloat(f);
  if (v >= 875 && v <= 1080) v /= 10;
  return v.toFixed(1);
}

/** "mom please", "to mom" → "mom". */
export function strip(who: string): string {
  return who
    .replace(/^(to|my) /, '')
    .replace(/ (please|plz|now|karo|करो|lagao|लगाओ|kar do|कर दो)$/, '')
    .trim();
}

/** Names for the same person in English, Hinglish and Hindi. */
export const SAME: string[][] = [
  ['mom', 'mum', 'mummy', 'mumma', 'mama', 'maa', 'ma', 'mother', 'मम्मी', 'माँ', 'मां', 'माता'],
  ['dad', 'daddy', 'papa', 'father', 'pitaji', 'पापा', 'पिताजी'],
  ['wife', 'biwi', 'बीवी', 'पत्नी'],
  ['husband', 'pati', 'पति'],
  ['brother', 'bhai', 'bhaiya', 'भाई', 'भैया'],
  ['sister', 'didi', 'behen', 'दीदी', 'बहन'],
  ['home', 'ghar', 'घर'],
  ['office', 'ऑफिस', 'दफ्तर'],
];

/** Whether a favourite's name matches what was heard, allowing for the words above. */
export function sameName(favourite: string, heard: string): boolean {
  const f = normalise(favourite);
  const h = normalise(heard);
  if (f === '' || h === '') return false;
  if (f === h || f.includes(h) || h.includes(f)) return true;
  for (const group of SAME) {
    let a = false;
    let b = false;
    for (const w of group) {
      if ((' ' + f + ' ').includes(' ' + w + ' ')) a = true;
      if ((' ' + h + ' ').includes(' ' + w + ' ')) b = true;
    }
    if (a && b) return true;
  }
  return false;
}

/** A phone number said aloud: digits only, at least 3, or "" when it isn't one. */
export function number(heard: string): string {
  const d = normalise(heard).replace(/[^0-9+]/g, '');
  return d.replace(/\+/g, '').length >= 3 && normalise(heard).replace(/[0-9+ -]/g, '') === '' ? d : '';
}

/**
 * Which of the recogniser's guesses to act on (HomeActivity.heard): the best guess first, but a
 * later guess wins if it is a real command and the earlier ones were only places. Null when
 * nothing usable was heard.
 */
export function pick(said: string[]): Command | null {
  let cmd: Command | null = null;
  for (const h of said) {
    const x = parse(h);
    if (x == null) continue;
    if (cmd == null) cmd = x;
    if (x.kind !== 'search') return x;
  }
  return cmd;
}

/**
 * Where to put the floating mic (Floaters.place): the saved spot ('micX', 'micY', as a share of
 * the screen) less half the button, kept on screen. Returns [x, y] of its top-left corner.
 */
export function place(fx: number, fy: number, w: number, h: number, size: number): [number, number] {
  const x = Math.max(0, Math.min(w - size, fx * w - size / 2));
  const y = Math.max(0, Math.min(h - size, fy * h - size / 2));
  return [x, y];
}
