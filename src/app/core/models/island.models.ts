export type IslandItemCode =
  | 'MATCHES'
  | 'SWISS_KNIFE'
  | 'WATER_BARREL'
  | 'FLARE_GUN'
  | 'SEEDS'
  | 'GUITAR'
  | 'HAMMOCK'
  | 'BOOK'
  | 'FLAMINGO'
  | 'TOILET_PAPER'
  | 'ROUTER'
  | 'MYSTERY_BOX';

export interface IslandItem {
  code: IslandItemCode;
  title: string;
  trait: string;
}

/** INVITED → PICKING → NIGHT → SHORTLIST → COMPLETED; DECLINED і EXPIRED чат не зачіпають. */
export type IslandStatus =
  | 'INVITED'
  | 'PICKING'
  | 'NIGHT'
  | 'SHORTLIST'
  | 'COMPLETED'
  | 'DECLINED'
  | 'EXPIRED';

export interface IslandNightEvent {
  code: string;
  prompt: string;
  /** Відповідь — індекс варіанта в цьому масиві. */
  options: string[];
}

export interface IslandRole {
  code: 'HOST' | 'SEEKER' | 'COZY' | 'SPARK';
  title: string;
  meaning: string;
}

export interface IslandPairCard {
  styleCode: string;
  styleTitle: string;
  styleText: string;
  rare: boolean;
  signatureCode: string | null;
  signatureTitle: string | null;
  myRole: IslandRole;
  partnerRole: IslandRole;
}

export interface IslandProposal {
  items: IslandItemCode[];
  name: string;
}

/** Партія очима поточного користувача: ходи партнера видно лише після того, як походили обоє. */
export interface IslandGame {
  gameId: number;
  chatId: number;
  status: IslandStatus;
  invitedById: number;
  createdAt: string;
  expiresAt: string | null;
  completedAt: string | null;

  myPick: IslandItemCode[] | null;
  myNote: string | null;
  partnerPicked: boolean;
  partnerPick: IslandItemCode[] | null;
  partnerNote: string | null;
  sharedItems: IslandItemCode[] | null;

  myGuess: IslandItemCode[] | null;
  partnerGuessed: boolean;
  partnerGuess: IslandItemCode[] | null;
  myGuessHits: IslandItemCode[] | null;
  partnerGuessHits: IslandItemCode[] | null;

  nightEvent: IslandNightEvent | null;
  myNightChoice: number | null;
  partnerNightAnswered: boolean;
  partnerNightChoice: number | null;

  shortlistPool: IslandItemCode[] | null;
  keepCount: number | null;
  myProposal: IslandProposal | null;
  partnerProposal: IslandProposal | null;
  itemsAgreed: boolean;
  nameAgreed: boolean;

  finalItems: IslandItemCode[] | null;
  islandName: string | null;
  /** Лише в COMPLETED. */
  pairCard: IslandPairCard | null;
}
