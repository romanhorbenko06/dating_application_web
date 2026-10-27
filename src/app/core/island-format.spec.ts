import { canInvite, clock, isMyMove, stepOf, tileBackground } from './island-format';
import { IslandGame } from './models/island.models';

const ME = 1;
const PARTNER = 2;

function game(patch: Partial<IslandGame>): IslandGame {
  return {
    gameId: 10,
    chatId: 5,
    status: 'PICKING',
    invitedById: PARTNER,
    createdAt: '2026-09-21T10:00:00',
    expiresAt: null,
    completedAt: null,
    myPick: null,
    myNote: null,
    partnerPicked: false,
    partnerPick: null,
    partnerNote: null,
    sharedItems: null,
    myGuess: null,
    partnerGuessed: false,
    partnerGuess: null,
    myGuessHits: null,
    partnerGuessHits: null,
    nightEvent: null,
    myNightChoice: null,
    partnerNightAnswered: false,
    partnerNightChoice: null,
    shortlistPool: null,
    keepCount: null,
    myProposal: null,
    partnerProposal: null,
    itemsAgreed: false,
    nameAgreed: false,
    finalItems: null,
    islandName: null,
    pairCard: null,
    ...patch,
  };
}

describe('island-format', () => {
  describe('stepOf', () => {
    it('вибір і здогад — це два кроки однієї фази', () => {
      expect(stepOf(game({ status: 'PICKING' }))).toBe(1);
      expect(stepOf(game({ status: 'PICKING', myPick: ['MATCHES', 'GUITAR', 'BOOK'] }))).toBe(2);
    });

    it('ніч, спільний список і фінал', () => {
      expect(stepOf(game({ status: 'NIGHT' }))).toBe(4);
      expect(stepOf(game({ status: 'SHORTLIST' }))).toBe(5);
      expect(stepOf(game({ status: 'COMPLETED' }))).toBe(5);
    });

    it('поза грою кроку немає', () => {
      expect(stepOf(null)).toBeNull();
      expect(stepOf(game({ status: 'INVITED' }))).toBeNull();
      expect(stepOf(game({ status: 'EXPIRED' }))).toBeNull();
    });
  });

  describe('isMyMove', () => {
    it('запрошення чекає на того, кого запросили', () => {
      expect(isMyMove(game({ status: 'INVITED', invitedById: PARTNER }), ME)).toBe(true);
      expect(isMyMove(game({ status: 'INVITED', invitedById: ME }), ME)).toBe(false);
    });

    it('у вибір хід мій, поки не здав і набір, і здогад', () => {
      expect(isMyMove(game({ myPick: ['MATCHES', 'GUITAR', 'BOOK'] }), ME)).toBe(true);
      expect(
        isMyMove(game({ myPick: ['MATCHES', 'GUITAR', 'BOOK'], myGuess: ['SEEDS', 'ROUTER', 'HAMMOCK'] }), ME),
      ).toBe(false);
    });

    it('вночі — поки не відповів; нуль теж відповідь', () => {
      expect(isMyMove(game({ status: 'NIGHT' }), ME)).toBe(true);
      expect(isMyMove(game({ status: 'NIGHT', myNightChoice: 0 }), ME)).toBe(false);
    });

    it('у спільному списку, поки пропозиції розходяться, хід за обома', () => {
      const proposal = { items: ['MATCHES' as const], name: 'Острів' };
      expect(isMyMove(game({ status: 'SHORTLIST' }), ME)).toBe(true);
      expect(isMyMove(game({ status: 'SHORTLIST', myProposal: proposal, itemsAgreed: true }), ME)).toBe(true);
      expect(
        isMyMove(game({ status: 'SHORTLIST', myProposal: proposal, itemsAgreed: true, nameAgreed: true }), ME),
      ).toBe(false);
    });

    it('без партії чи без користувача ходу немає', () => {
      expect(isMyMove(null, ME)).toBe(false);
      expect(isMyMove(game({}), null)).toBe(false);
    });
  });

  describe('canInvite', () => {
    it('можна, коли ще не грали або партія згоріла', () => {
      expect(canInvite(null, ME)).toBe(true);
      expect(canInvite(game({ status: 'EXPIRED', invitedById: ME }), ME)).toBe(true);
    });

    it('після відмови запрошує лише той, хто відмовив', () => {
      expect(canInvite(game({ status: 'DECLINED', invitedById: ME }), ME)).toBe(false);
      expect(canInvite(game({ status: 'DECLINED', invitedById: PARTNER }), ME)).toBe(true);
    });

    it('живу або дограну партію не перезапускаємо', () => {
      expect(canInvite(game({ status: 'PICKING' }), ME)).toBe(false);
      expect(canInvite(game({ status: 'COMPLETED' }), ME)).toBe(false);
    });
  });

  it('clock: хвилини й секунди з нулем попереду, без від’ємних', () => {
    expect(clock(42)).toBe('0:42');
    expect(clock(60)).toBe('1:00');
    expect(clock(5)).toBe('0:05');
    expect(clock(-3)).toBe('0:00');
  });

  it('tileBackground: фото предмета поверх його градієнта-заглушки', () => {
    expect(tileBackground('FLAMINGO')).toContain('#fbd0e0');
    expect(tileBackground('WATER_BARREL')).toContain("url('/island/items/water-barrel.jpg')");
    expect(tileBackground('MATCHES')).not.toBe(tileBackground('GUITAR'));
  });
});
