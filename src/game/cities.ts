// Each city is a stage, like San Francisco / New York / Texas in the original.
// Every stage ends with a chase from a giant rolling Charba bottle.

export type Landmark = 'minaret' | 'dome' | 'gate' | 'lighthouse' | 'palm' | 'tower';

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
    landmarks: ['minaret', 'tower', 'dome', 'palm'],
    sea: '#2E86C1',
    length: 1100,
    chaseLength: 380,
    baseSpeed: 15,
    density: 0.45,
    seed: 11,
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
    taxi: '#E9C46A',
    landmarks: ['minaret', 'palm', 'gate', 'palm'],
    length: 1250,
    chaseLength: 420,
    baseSpeed: 16.5,
    density: 0.55,
    seed: 23,
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
    landmarks: ['gate', 'minaret', 'dome', 'minaret'],
    length: 1350,
    chaseLength: 450,
    baseSpeed: 17.5,
    density: 0.65,
    seed: 37,
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
    taxi: '#4FC3F7',
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
