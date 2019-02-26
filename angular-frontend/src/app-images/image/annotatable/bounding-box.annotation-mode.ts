import {EMPTY, fromEvent, Observable, zip} from 'rxjs';
import {AnnotationMode, PrematureAnnotation} from './annotation-mode';
import {HostListener} from '@angular/core';


export class BoundingBoxAnnotationMode extends AnnotationMode {

    handle(): Observable<PrematureAnnotation> {

        this.captureEvents();
        return EMPTY;
    }

    reset() {
    }

    private captureEvents() {
        console.log('Listening to canvas events');

        this.click$.subscribe(console.log);
        this.move$.subscribe(value => {
            this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
            // console.log(value);
            this.draw_crosshair(value);
        });
    }
}
