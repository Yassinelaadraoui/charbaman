// Leaderboard names are public, so obvious insults and slurs are turned away before posting.
// English, French and Moroccan Darija (in Latin letters, with the usual 3/7/9 for Arabic letters) and
// Arabic script. Short words only match whole words, so ordinary names that contain them still pass.

const LONG = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'rape', 'nazi', 'hitler',
  'porn', 'asshole', 'penis', 'vagina', 'dildo',
  // French
  'putain', 'salope', 'connard', 'connasse', 'encule', 'merde', 'nique', 'batard', 'couille', 'negre', 'pedale',
  'bougnoul', 'bicot',
  // Darija
  'qahba', '9ahba', 'kahba', 'zamel', 'zemel', 'tabon', 'tbon', 'zebi', 'zabi', 'nikmok', 'nik mok', 'khra', 'mnayek',
  '9lawi', 'tqawed',
  // Arabic script
  'قحبة', 'قحبه', 'زامل', 'طبون', 'شرموطة', 'شرموطه', 'نيك', 'زبي', 'خرا', 'منيوك', 'كلب',
];
const WHOLE = ['sex', 'dick', 'cock', 'fag', 'pute', 'pd', 'fdp', 'ntm', 'bite', 'zbi', 'nik', 'kss', 'زب', 'كس'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '4': 'a', '5': 's', '$': 's', '@': 'a', '!': 'i' };

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é -> e
    .replace(/[ً-ٟـ]/g, ''); // Arabic vowel marks and tatweel

// Returns the name to post, or null when it should be refused.
export function cleanName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!name) return 'Charbaman';
  const plain = normalise(name);
  // Darija digits (3, 7, 9) stand for letters, so check the text both with and without the leet swaps.
  const swapped = plain.replace(/[014$5@!]/g, (c) => LEET[c] ?? c);
  for (const text of [plain, swapped]) {
    const squashed = text.replace(/[^a-z0-9؀-ۿ]/g, '');
    if (LONG.some((w) => squashed.includes(w.replace(/\s/g, '')))) return null;
    const words = text.split(/[^a-z0-9؀-ۿ]+/);
    if (words.some((w) => WHOLE.includes(w))) return null;
  }
  return name;
}
