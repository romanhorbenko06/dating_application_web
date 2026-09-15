import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PhotoContent, PhotoResponse } from './models/photo.models';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private http = inject(HttpClient);

  /** Ліміт бекенду (app.photos.max-per-user) — дублюємо, щоб не давати натиснути дарма. */
  static readonly MAX_PHOTOS = 6;

  /** Формати, які бекенд уміє декодувати. WEBP свідомо не підтримується. */
  static readonly ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/bmp';

  /** Лише метадані — коли потрібна кількість фото, а не самі пікселі. */
  getPhotos(userId: number): Observable<PhotoResponse[]> {
    return this.http.get<PhotoResponse[]>(`/api/photos/user/${userId}`);
  }

  /**
   * Фото з вмістом. Для чужого користувача бекенд віддасть порожній список
   * без метчу — це не помилка, а сама суть механіки «фото після взаємного лайку».
   */
  getPhotoContents(userId: number): Observable<PhotoContent[]> {
    return this.http.get<PhotoContent[]>(`/api/photos/user/${userId}/content`);
  }

  /**
   * multipart-завантаження. Content-Type НЕ виставляємо руками: браузер має сам
   * додати boundary, інакше Spring не розбере частини запиту.
   */
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
