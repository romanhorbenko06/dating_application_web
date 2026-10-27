export interface PhotoResponse {
  photoId: number;
  url: string;
  contentType: string;
  isMain: boolean;
  ownerId: number;
}

/** dataUri одразу в <img [src]>: окремий запит не спрацював би, бо <img> не носить Authorization. */
export interface PhotoContent {
  photoId: number;
  isMain: boolean;
  contentType: string;
  dataUri: string;
}
