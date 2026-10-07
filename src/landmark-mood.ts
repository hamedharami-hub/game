import type { District } from './state.ts';

const palettes: Readonly<Record<District, readonly [string, string]>> = {
  garden: ['#e6a9c2', '#f8d9ab'],
  greenhouse: ['#91cdb3', '#d7e8b4'],
  home: ['#e5bd91', '#f0d9b0'],
  village: ['#f0cf84', '#e6a99d'],
  grove: ['#8dc9bd', '#93bcd3'],
  sanctuary: ['#c2b0dd', '#a9c4e4'],
};

export function landmarkMood(id: District): readonly [string, string] {
  return palettes[id];
}
