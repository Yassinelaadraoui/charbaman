// Each city is a stage, like San Francisco / New York / Texas in the original.
// Every stage ends with a chase from a giant rolling Charba bottle.

export type Landmark =
  | 'minaret'
  | 'dome'
  | 'gate'
  | 'lighthouse'
  | 'palm'
  | 'tower'
  | 'fortress'
  | 'kiln'
  | 'mosque' // Hassan II Mosque model
  | 'koutoubia' // tower model standing in for the Koutoubia
  | 'bab' // city gate model
  | 'ramparts' // earthen city walls model
  | 'mountain'; // the Rif behind Chefchaouen, the Anti-Atlas behind Agadir

export type City = {
  id: string;
  name: string;
  arabic: string;
  tagline: string;
  skyTop: string;
  skyBottom: string;
  sun: string;
  far: string; // distant skyline silhouette
  near: string; // buildings
  accent: string; // tiles, doors, trims
  ground: [string, string];
  road: [string, string];
  curb: [string, string];
  line: string;
  taxi: string; // petit taxi colour differs per city
  landmarks: Landmark[];
  sea?: string;
  length: number; // metres before the chase starts
  chaseLength: number;
  baseSpeed: number; // m/s
  density: number; // 0..1 obstacle density
  seed: number;
  night?: boolean; // lamps lit, dark sky
  chaser?: 'bottle' | 'police'; // what chases you at the end (the giant Charba unless set)
};

export const CITIES: City[] = [
  {
    id: 'casablanca',
    name: 'Casablanca',
    arabic: 'الدار البيضاء',
    tagline: 'Sprint the Corniche past Hassan II',
    skyTop: '#5BB8F5',
    skyBottom: '#CDEBFF',
    sun: '#FFF3B0',
    far: '#9CC3DD',
    near: '#F4F1EA',
    accent: '#2A9D8F',
    ground: ['#D9CFC1', '#CFC4B4'],
    road: ['#5B5F66', '#555960'],
    curb: ['#FFFFFF', '#E63946'],
    line: '#FFFFFF',
    taxi: '#D62828',
    landmarks: ['mosque', 'tower', 'dome', 'palm'],
    sea: '#2E86C1',
    length: 1100,
    chaseLength: 380,
    baseSpeed: 15,
    density: 0.45,
    seed: 11,
  },
  {
    id: 'rabat',
    name: 'Rabat',
    arabic: 'الرباط',
    tagline: 'Night run to the Hassan Tower',
    skyTop: '#0B1A3A',
    skyBottom: '#3A4E7A',
    sun: '#9DB4FF',
    far: '#2C3A5C',
    near: '#E8E2D4',
    accent: '#2A7F62',
    ground: ['#9C968A', '#938D82'],
    road: ['#3E434B', '#3A3F47'],
    curb: ['#E8E2D4', '#C1272D'],
    line: '#F2EFE6',
    taxi: '#2B6CB0',
    landmarks: ['koutoubia', 'ramparts', 'bab', 'lighthouse'],
    sea: '#16325C',
    length: 1150,
    chaseLength: 390,
    baseSpeed: 15.4,
    density: 0.48,
    seed: 13,
    night: true,
  },
  {
    id: 'safi',
    name: 'Safi',
    arabic: 'آسفي',
    tagline: 'Leap the pottery stacks by Ksar el Bahr',
    skyTop: '#3A9AD9',
    skyBottom: '#FFE3B8',
    sun: '#FFF1C1',
    far: '#C9A27A',
    near: '#F3E9DA',
    accent: '#2E7D32',
    ground: ['#D8C3A5', '#CDB797'],
    road: ['#6B6460', '#645D59'],
    curb: ['#F3E9DA', '#2E7D32'],
    line: '#F3E9DA',
    taxi: '#F5F5F2',
    landmarks: ['fortress', 'kiln', 'minaret', 'kiln'],
    sea: '#1F6FA8',
    length: 1180,
    chaseLength: 400,
    baseSpeed: 15.8,
    density: 0.5,
    seed: 17,
  },
  {
    id: 'agadir',
    name: 'Agadir',
    arabic: 'أكادير',
    tagline: 'Race the seafront under the Kasbah',
    skyTop: '#2F9BE0',
    skyBottom: '#FFE9C7',
    sun: '#FFF6D5',
    far: '#B9A07E',
    near: '#F7F2E7',
    accent: '#D9822B',
    ground: ['#E9DCC3', '#E0D2B7'],
    road: ['#5E6166', '#585B60'],
    curb: ['#F7F2E7', '#D9822B'],
    line: '#FFFFFF',
    taxi: '#F08A24',
    landmarks: ['fortress', 'mountain', 'palm', 'palm'],
    sea: '#1C86C8',
    length: 1220,
    chaseLength: 410,
    baseSpeed: 16.2,
    density: 0.52,
    seed: 19,
  },
  {
    id: 'marrakech',
    name: 'Marrakech',
    arabic: 'مراكش',
    tagline: 'Dodge carts through Jemaa el-Fna',
    skyTop: '#FF8C42',
    skyBottom: '#FFD6A5',
    sun: '#FFE066',
    far: '#C9714B',
    near: '#C8553D',
    accent: '#2D6A4F',
    ground: ['#D98B5F', '#CF8055'],
    road: ['#B5654A', '#AD5E44'],
    curb: ['#F6D7B0', '#8B3A2B'],
    line: '#F6D7B0',
    taxi: '#F4C430',
    landmarks: ['koutoubia', 'ramparts', 'bab', 'palm'],
    length: 1250,
    chaseLength: 420,
    baseSpeed: 16.5,
    density: 0.55,
    seed: 23,
    chaser: 'police', // the medina police want a word
  },
  {
    id: 'fes',
    name: 'Fes',
    arabic: 'فاس',
    tagline: 'Race the medina at Bab Boujloud',
    skyTop: '#6D4C9F',
    skyBottom: '#F7B2AD',
    sun: '#FFD1A1',
    far: '#7E6A9A',
    near: '#D9B48F',
    accent: '#1D6FB8',
    ground: ['#BFA584', '#B39978'],
    road: ['#8E7B66', '#86735F'],
    curb: ['#1D6FB8', '#2A9D8F'],
    line: '#E9DCC9',
    taxi: '#C1121F',
    landmarks: ['bab', 'minaret', 'dome', 'minaret'],
    length: 1350,
    chaseLength: 450,
    baseSpeed: 17.5,
    density: 0.65,
    seed: 37,
  },
  {
    id: 'chefchaouen',
    name: 'Chefchaouen',
    arabic: 'شفشاون',
    tagline: 'Fly through the blue city',
    skyTop: '#4A90D9',
    skyBottom: '#DDEBFA',
    sun: '#FFFFFF',
    far: '#7FA0C4',
    near: '#7FB2E5',
    accent: '#1F5FAF',
    ground: ['#A9C6E8', '#9FBDE0'],
    road: ['#6C7A8C', '#657384'],
    curb: ['#FFFFFF', '#2F6FC0'],
    line: '#FFFFFF',
    taxi: '#3B7DD8',
    landmarks: ['mountain', 'minaret', 'ramparts', 'mountain'],
    length: 1400,
    chaseLength: 470,
    baseSpeed: 18,
    density: 0.7,
    seed: 43,
  },
  {
    id: 'tangier',
    name: 'Tangier',
    arabic: 'طنجة',
    tagline: 'Final dash to the Strait',
    skyTop: '#1E88E5',
    skyBottom: '#BDE4FF',
    sun: '#FFFFFF',
    far: '#7FA9C9',
    near: '#FFFFFF',
    accent: '#1565C0',
    ground: ['#E6E2D6', '#DCD7C9'],
    road: ['#4E5A65', '#48535D'],
    curb: ['#FFFFFF', '#1565C0'],
    line: '#FFFFFF',
    taxi: '#1E6FD9',
    landmarks: ['lighthouse', 'minaret', 'dome', 'tower'],
    sea: '#0D6EBF',
    length: 1450,
    chaseLength: 500,
    baseSpeed: 18.5,
    density: 0.75,
    seed: 51,
  },
];

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
