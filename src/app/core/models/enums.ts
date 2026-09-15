/**
 * Копії enum-ів бекенду (com.example.dating_application.Entity).
 * Значення мають збігатися СИМВОЛ У СИМВОЛ — бекенд віддає 400 на невідоме значення.
 */

export type Gender =
  | 'MALE'
  | 'FEMALE'
  | 'NON_BINARY'
  | 'TRANSGENDER'
  | 'GENDERQUEER'
  | 'GENDERFLUID'
  | 'AGENDER'
  | 'BIGENDER'
  | 'INTERSEX'
  | 'OTHER'
  | 'PREFER_NOT_TO_SAY';

export type DatingGoal =
  | 'LIFE_PARTNER'
  | 'MARRIAGE'
  | 'LONG_TERM_RELATIONSHIP'
  | 'LONG_TERM_OPEN_TO_SHORT'
  | 'SHORT_TERM_RELATIONSHIP'
  | 'SHORT_TERM_OPEN_TO_LONG'
  | 'CASUAL_DATING'
  | 'HOOKUPS'
  | 'COMPANIONSHIP'
  | 'FRIENDSHIP'
  | 'NEW_FRIENDS'
  | 'NETWORKING'
  | 'ACTIVITY_PARTNER'
  | 'STILL_FIGURING_IT_OUT'
  | 'PREFER_NOT_TO_SAY';

export type Role = 'DATER' | 'ADMIN';

/** Підписи для випадних списків. Ключ — значення для API, значення — те, що бачить людина. */
export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Чоловік',
  FEMALE: 'Жінка',
  NON_BINARY: 'Небінарна особа',
  TRANSGENDER: 'Трансгендерна особа',
  GENDERQUEER: 'Ґендерквір',
  GENDERFLUID: 'Ґендерфлюїд',
  AGENDER: 'Аґендер',
  BIGENDER: 'Біґендер',
  INTERSEX: 'Інтерсекс',
  OTHER: 'Інше',
  PREFER_NOT_TO_SAY: 'Волію не вказувати',
};

export const DATING_GOAL_LABELS: Record<DatingGoal, string> = {
  LIFE_PARTNER: 'Супутник життя',
  MARRIAGE: 'Шлюб',
  LONG_TERM_RELATIONSHIP: 'Тривалі стосунки',
  LONG_TERM_OPEN_TO_SHORT: 'Тривалі, але відкритий(-а) до коротких',
  SHORT_TERM_RELATIONSHIP: 'Короткі стосунки',
  SHORT_TERM_OPEN_TO_LONG: 'Короткі, але відкритий(-а) до тривалих',
  CASUAL_DATING: 'Побачення без зобов’язань',
  HOOKUPS: 'Нічого серйозного',
  COMPANIONSHIP: 'Товариство',
  FRIENDSHIP: 'Дружба',
  NEW_FRIENDS: 'Нові знайомства',
  NETWORKING: 'Нетворкінг',
  ACTIVITY_PARTNER: 'Компанія для активностей',
  STILL_FIGURING_IT_OUT: 'Ще визначаюся',
  PREFER_NOT_TO_SAY: 'Волію не вказувати',
};

/** Готові масиви для *@for* у шаблонах селектів. */
export const GENDER_OPTIONS = Object.entries(GENDER_LABELS) as [Gender, string][];
export const DATING_GOAL_OPTIONS = Object.entries(DATING_GOAL_LABELS) as [DatingGoal, string][];

/** Необов'язкові поля анкети (FR-8.5 … FR-8.7). null = «не вказано». */

export type EducationLevel =
  | 'SECONDARY'
  | 'VOCATIONAL'
  | 'INCOMPLETE_HIGHER'
  | 'BACHELOR'
  | 'MASTER'
  | 'DOCTORATE'
  | 'PREFER_NOT_TO_SAY';

export type Temperament =
  | 'SANGUINE'
  | 'CHOLERIC'
  | 'PHLEGMATIC'
  | 'MELANCHOLIC'
  | 'PREFER_NOT_TO_SAY';

/** Значення поєднують «чи є діти» і «чи хоче далі» — бекенд свідомо звів це в один список. */
export type ChildrenStatus =
  | 'NO_CHILDREN_WANT_SOMEDAY'
  | 'NO_CHILDREN_DONT_WANT'
  | 'HAVE_CHILDREN_WANT_MORE'
  | 'HAVE_CHILDREN_DONT_WANT_MORE'
  | 'UNDECIDED'
  | 'PREFER_NOT_TO_SAY';

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  SECONDARY: 'Середня',
  VOCATIONAL: 'Професійно-технічна',
  INCOMPLETE_HIGHER: 'Незакінчена вища',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магістр',
  DOCTORATE: 'Науковий ступінь',
  PREFER_NOT_TO_SAY: 'Волію не вказувати',
};

export const TEMPERAMENT_LABELS: Record<Temperament, string> = {
  SANGUINE: 'Сангвінік',
  CHOLERIC: 'Холерик',
  PHLEGMATIC: 'Флегматик',
  MELANCHOLIC: 'Меланхолік',
  PREFER_NOT_TO_SAY: 'Волію не вказувати',
};

export const CHILDREN_STATUS_LABELS: Record<ChildrenStatus, string> = {
  NO_CHILDREN_WANT_SOMEDAY: 'Дітей немає, хочу колись',
  NO_CHILDREN_DONT_WANT: 'Дітей немає і не планую',
  HAVE_CHILDREN_WANT_MORE: 'Є діти, хочу ще',
  HAVE_CHILDREN_DONT_WANT_MORE: 'Є діти, більше не планую',
  UNDECIDED: 'Ще не вирішив(-ла)',
  PREFER_NOT_TO_SAY: 'Волію не вказувати',
};

export const EDUCATION_LEVEL_OPTIONS = Object.entries(EDUCATION_LEVEL_LABELS) as [
  EducationLevel,
  string,
][];
export const TEMPERAMENT_OPTIONS = Object.entries(TEMPERAMENT_LABELS) as [Temperament, string][];
export const CHILDREN_STATUS_OPTIONS = Object.entries(CHILDREN_STATUS_LABELS) as [
  ChildrenStatus,
  string,
][];
