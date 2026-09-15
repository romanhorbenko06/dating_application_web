import { EMPTY, ageFrom, agoLabel, formatDate, genderLabel, plural } from './profile-format';

/**
 * Чисті функції форматування. Тестуються без Angular: ні DOM, ні сервісів тут
 * немає, тож і піднімати TestBed немає сенсу.
 */
describe('profile-format', () => {
  describe('plural — українська множина', () => {
    it('обирає форму за останньою цифрою, а не за самим числом', () => {
      const форма = (n: number) => plural(n, 'анкета', 'анкети', 'анкет');

      expect(форма(1)).toBe('анкета');
      expect(форма(2)).toBe('анкети');
      expect(форма(5)).toBe('анкет');
      expect(форма(21)).toBe('анкета');
      expect(форма(22)).toBe('анкети');
    });

    it('11–14 — виняток: завжди «анкет», попри останню цифру', () => {
      const форма = (n: number) => plural(n, 'анкета', 'анкети', 'анкет');

      expect(форма(11)).toBe('анкет');
      expect(форма(12)).toBe('анкет');
      expect(форма(14)).toBe('анкет');
      expect(форма(111)).toBe('анкет');
    });

    it('нуль бере форму родового відмінка', () => {
      expect(plural(0, 'анкета', 'анкети', 'анкет')).toBe('анкет');
    });
  });

  describe('ageFrom — вік у повних роках', () => {
    /**
     * Дата рядком БЕЗ toISOString: той переводить локальний час у UTC і в
     * додатних часових поясах зсуває день назад — тест ловив би не вік,
     * а зсув часових поясів.
     */
    const localIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    it('не зараховує рік, якщо день народження цього року ще не настав', () => {
      const today = new Date();
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const birth = new Date(today.getFullYear() - 30, tomorrow.getMonth(), tomorrow.getDate());

      expect(ageFrom(localIso(birth))).toBe(29);
    });

    it('зараховує рік у сам день народження', () => {
      const today = new Date();
      const birth = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());

      expect(ageFrom(localIso(birth))).toBe(30);
    });

    it('порожнє або сміттєве значення дає null, а не NaN', () => {
      expect(ageFrom(null)).toBeNull();
      expect(ageFrom('не дата')).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('перетворює ISO на звичну дату', () => {
      expect(formatDate('1995-07-02')).toContain('1995');
    });

    it('порожнє значення показує прочерком, а не «Invalid Date»', () => {
      expect(formatDate(null)).toBe(EMPTY);
      expect(formatDate('казна-що')).toBe(EMPTY);
    });
  });

  describe('agoLabel', () => {
    it('щойно надіслане показує як «сьогодні»', () => {
      expect(agoLabel(new Date().toISOString())).toBe('сьогодні');
    });

    it('вчорашнє відрізняє від сьогоднішнього', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      expect(agoLabel(yesterday.toISOString())).toBe('вчора');
    });
  });

  describe('підписи енумів', () => {
    it('перекладають значення бекенду', () => {
      expect(genderLabel('FEMALE')).toBe('Жінка');
    });

    it('порожнє значення дає прочерк', () => {
      expect(genderLabel(null)).toBe(EMPTY);
    });
  });
});
