import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';

import { IslandGame, IslandItem, IslandItemCode } from './models/island.models';

@Injectable({ providedIn: 'root' })
export class IslandService {
  private http = inject(HttpClient);

  private readonly catalog$ = this.http
    .get<IslandItem[]>('/api/island/items')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  items(): Observable<IslandItem[]> {
    return this.catalog$;
  }

  itemMap(): Observable<Map<IslandItemCode, IslandItem>> {
    return this.catalog$.pipe(map((list) => new Map(list.map((item) => [item.code, item]))));
  }

  /** null — тут ще не грали (204). */
  current(chatId: number): Observable<IslandGame | null> {
    return this.http.get<IslandGame | null>(`/api/chats/${chatId}/island`);
  }

  invite(chatId: number): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island`, {});
  }

  accept(chatId: number): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island/accept`, {});
  }

  decline(chatId: number): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island/decline`, {});
  }

  pick(chatId: number, items: IslandItemCode[], note: string | null): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island/picks`, { items, note });
  }

  guess(chatId: number, items: IslandItemCode[]): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island/guess`, { items });
  }

  night(chatId: number, choice: number): Observable<IslandGame> {
    return this.http.post<IslandGame>(`/api/chats/${chatId}/island/night`, { choice });
  }

  propose(chatId: number, items: IslandItemCode[], name: string): Observable<IslandGame> {
    return this.http.put<IslandGame>(`/api/chats/${chatId}/island/shortlist`, { items, name });
  }
}
