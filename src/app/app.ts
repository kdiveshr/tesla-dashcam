import { Component } from '@angular/core';

import { Shell } from './layout/shell/shell';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Shell],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}