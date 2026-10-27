import { IslandGame, IslandItemCode } from './models/island.models';

/** Колір-заглушка предмета, поки не завантажилось фото. */
const TILE_COLORS: Record<IslandItemCode, [string, string]> = {
  MATCHES: ['#f3d9b8', '#c99a5f'],
  SWISS_KNIFE: ['#dfe4e8', '#8d9aa5'],
  WATER_BARREL: ['#cfe3ea', '#6f98a8'],
  FLARE_GUN: ['#f6cdcd', '#c07070'],
  SEEDS: ['#dbe8cf', '#87a172'],
  GUITAR: ['#f0dcc4', '#b98f63'],
  HAMMOCK: ['#e6ddef', '#9f8bb5'],
  BOOK: ['#e3ded6', '#9a9187'],
  FLAMINGO: ['#fbd0e0', '#e07ca6'],
  TOILET_PAPER: ['#f2efe9', '#c2bcb2'],
  ROUTER: ['#d8dfe9', '#7f8ea6'],
  MYSTERY_BOX: ['#ecd9c4', '#b08a63'],
};

/** Фото з public/island/items (ліцензії — у CREDITS.md): WATER_BARREL → water-barrel.jpg. */
export function itemImage(code: IslandItemCode): string {
  return `/island/items/${code.toLowerCase().replace(/_/g, '-')}.jpg`;
}

export function tileBackground(code: IslandItemCode): string {
  const [from, to] = TILE_COLORS[code] ?? ['#eee5df', '#b3a7a0'];
  return `url('${itemImage(code)}') center / cover no-repeat, linear-gradient(150deg, ${from}, ${to})`;
}

export const ISLAND_STEPS = 5;

/** Крок гравця 1..5: вибір і здогад — одна фаза PICKING, але два екрани. */
export function stepOf(game: IslandGame | null): number | null {
  if (!game) return null;
  switch (game.status) {
    case 'PICKING':
      return game.myPick ? 2 : 1;
    case 'NIGHT':
      return 4;
    case 'SHORTLIST':
      return 5;
    case 'COMPLETED':
      return ISLAND_STEPS;
    default:
      return null;
  }
}

/** У спільному списку, поки пропозиції розходяться, хід за обома. */
export function isMyMove(game: IslandGame | null, myId: number | null): boolean {
  if (!game || myId === null) return false;
  switch (game.status) {
    case 'INVITED':
      return game.invitedById !== myId;
    case 'PICKING':
      return !game.myPick || !game.myGuess;
    case 'NIGHT':
      return game.myNightChoice === null;
    case 'SHORTLIST':
      return !game.myProposal || !(game.itemsAgreed && game.nameAgreed);
    default:
      return false;
  }
}

export function isActive(game: IslandGame | null): boolean {
  return !!game && ['INVITED', 'PICKING', 'NIGHT', 'SHORTLIST'].includes(game.status);
}

/** Ті самі правила, що на бекенді, щоб не показувати кнопку, яка дасть відмову. */
export function canInvite(game: IslandGame | null, myId: number | null): boolean {
  if (!game) return true;
  if (game.status === 'EXPIRED') return true;
  if (game.status === 'DECLINED') return game.invitedById !== myId;
  return false;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
