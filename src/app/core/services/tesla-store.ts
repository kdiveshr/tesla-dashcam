import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { TeslaClip } from '../interfaces/tesla-clip.interface';
import { TeslaEvent } from '../interfaces/tesla-event.interface';


@Injectable({
  providedIn: 'root',
})
export class TeslaStore {


  private readonly clipsSubject =
    new BehaviorSubject<TeslaClip[]>([]);


  private readonly eventsSubject =
    new BehaviorSubject<TeslaEvent[]>([]);



  readonly clips$: Observable<TeslaClip[]> =
    this.clipsSubject.asObservable();



  readonly events$: Observable<TeslaEvent[]> =
    this.eventsSubject.asObservable();



  setClips(
    clips: TeslaClip[]
  ): void {

    this.clipsSubject.next(clips);

  }



  setEvents(
    events: TeslaEvent[]
  ): void {

    this.eventsSubject.next(events);

  }



  clear(): void {

    this.clipsSubject.next([]);

    this.eventsSubject.next([]);

  }


}