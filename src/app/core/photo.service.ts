import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PhotoContent, PhotoResponse } from './models/photo.models';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private http = inject(HttpClient);

  /** Дублює ліміт бекенду. */
  static readonly MAX_PHOTOS = 6;

  /** WEBP бекенд не декодує. */
  static readonly ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/bmp';

  getPhotos(userId: number): Observable<PhotoResponse[]> {
    return this.http.get<PhotoResponse[]>(`/api/photos/user/${userId}`);
  }

  /** Без метчу бекенд віддає порожній список — це не помилка. */
  getPhotoContents(userId: number): Observable<PhotoContent[]> {
    return this.http.get<PhotoContent[]>(`/api/photos/user/${userId}/content`);
  }

  /** Content-Type не виставляємо: браузер сам додає boundary. */
  upload(file: File, isMain = false): Observable<PhotoResponse> {
    const form = new FormData();
    form.append('file', file);

    return this.http.post<PhotoResponse>(`/api/photos?isMain=${isMain}`, form);
  }

  delete(photoId: number): Observable<unknown> {
    return this.http.delete(`/api/photos/${photoId}`);
  }

  setMain(photoId: number): Observable<PhotoResponse> {
    return this.http.put<PhotoResponse>(`/api/photos/${photoId}/main`, {});
  }
}
