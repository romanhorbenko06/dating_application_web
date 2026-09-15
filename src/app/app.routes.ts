import { Routes } from '@angular/router';

import { adminGuard, authGuard, daterGuard, guestGuard } from './core/auth.guard';

/**
 * loadComponent = ліниве завантаження: код екрана їде окремим шматком і качається
 * лише тоді, коли на нього справді перейшли. Для стартового бандла це помітно.
 */
export const routes: Routes = [
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((m) => m.About),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: 'verify',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/verify-code/verify-code').then((m) => m.VerifyCode),
  },
  {
    path: 'feed',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/feed/feed').then((m) => m.Feed),
  },
  {
    path: 'chats',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/chats/chats').then((m) => m.Chats),
  },
  {
    path: 'chats/:id',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/chat-room/chat-room').then((m) => m.ChatRoom),
  },
  {
    path: 'notifications',
    canActivate: [authGuard, daterGuard],
    loadComponent: () =>
      import('./pages/notifications/notifications').then((m) => m.Notifications),
  },
  {
    path: 'likes',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/likes/likes').then((m) => m.Likes),
  },
  {
    path: 'users/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile-view/profile-view').then((m) => m.ProfileView),
  },
  {
    path: 'profile',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
  },
  {
    path: 'profile/edit',
    canActivate: [authGuard, daterGuard],
    loadComponent: () => import('./pages/profile-edit/profile-edit').then((m) => m.ProfileEdit),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
  },
  { path: '', pathMatch: 'full', redirectTo: 'feed' },
  { path: '**', redirectTo: 'feed' },
];
