/** Метадані фото (GET /api/photos/user/{id}) — без самих байтів. */
export interface PhotoResponse {
  photoId: number;
  url: string;
  contentType: string;
  isMain: boolean;
  ownerId: number;
}

/**
 * Фото разом із вмістом (GET /api/photos/user/{id}/content).
 * `dataUri` уже готовий до <img [src]>, тож окремий запит за пікселями не потрібен —
 * а він і не спрацював би: <img> не носить заголовок Authorization.
 */
export interface PhotoContent {
  photoId: number;
  isMain: boolean;
  contentType: string;
  dataUri: string;
}
