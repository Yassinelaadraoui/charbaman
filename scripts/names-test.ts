import { cleanName } from '../src/services/names';
const cases: [string, boolean][] = [
  ['Yassine', true], ['Charbaman', true], ['Hafsa', true], ['Ahmed 9', true], ['Mohamed', true], ['Nikola', true], ['Dicky', true],
  ['Bitedd', true], ['Sexton', true], ['Nikita', true], ['يوسف', true], ['Zineb', true], ['   ', true], ['Ilyas', true],
  ['fuck', false], ['F.u.c.k', false], ['sh1t', false], ['9ahba', false], ['zamel', false], ['putain', false], ['enculé', false],
  ['nik', false], ['pd', false], ['قحبة', false], ['زب', false], ['Mr Zebi', false], ['b1tch', false],
];
let bad = 0;
for (const [n, ok] of cases) {
  const got = cleanName(n) !== null;
  if (got !== ok) { bad++; console.log('WRONG', JSON.stringify(n), 'expected', ok ? 'allowed' : 'refused'); }
}
console.log(bad ? `${bad} wrong` : `all ${cases.length} name cases right`);
process.exit(bad ? 1 : 0);
