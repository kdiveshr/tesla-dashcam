import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'upload',
    pathMatch: 'full',
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./features/upload/upload').then((m) => m.Upload),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
  path: 'player',
  loadComponent: () =>
    import('./features/player/player').then((m) => m.Player),
},
  {
    path: '**',
    redirectTo: 'upload',
  },
];