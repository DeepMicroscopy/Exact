import {Observable, Subject, zip} from 'rxjs';
import {AnnotationMode} from './annotation-mode';
import {AnnotationVector} from '../../../network/types/annotation';


export interface BoundingBoxVector extends AnnotationVector {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}


export class BoundingBoxAnnotationMode extends AnnotationMode {

    private result$: Subject<AnnotationVector> = new Subject();

    /** @inheritDoc */
    handle(): Observable<AnnotationVector> {
        return this.result$;
    }

    /** @inheritDoc */
    reset() {
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /** @inheritDoc */
    protected render() {
        this.reset();

        if (this.mouseMoves.size > 0) {
            this.drawCrosshair(this.mouseMoves.top);
        }

        if (this.mouseDowns.size > 0) {
            if (this.mouseDowns.size !== this.mouseUps.size) {
                // Draw currently dragged premature annotation
                const annotation = this.calcPrematureAnnotation(this.mouseDowns.top, this.mouseMoves.top);
                this.drawPrematureAnnotation(annotation);
                this.result$.next(annotation);

            } else {
                // An annotation was just finished
                this.result$.next(this.calcPrematureAnnotation(this.mouseDowns.pop(), this.mouseUps.pop()));
            }
        }

        if (this.mouseLeaves.size > 0) {

        }
    }

    private drawPrematureAnnotation(annotation: BoundingBoxVector) {
        const ctx = this.canvas.getContext('2d');

        const thickness = 4;

        ctx.strokeStyle = 'blue';
        ctx.strokeRect(annotation.x1, annotation.y1, annotation.x2 - annotation.x1, annotation.y2 - annotation.y1);
    }

    private calcPrematureAnnotation(start: MouseEvent, end: MouseEvent): BoundingBoxVector {
        const bounds = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;

        let top_left: { x: number, y: number };
        let bottom_right: { x: number, y: number };

        // Sort given points into top-left and bottom-right
        if (start.y < end.y) {
            if (start.x < end.x) {
                // Start is top-left, end is bottom-right
                top_left = {
                    x: (start.x - bounds.left) * scaleX,
                    y: (start.y - bounds.top) * scaleY
                };
                bottom_right = {
                    x: (end.x - bounds.left) * scaleX,
                    y: (end.y - bounds.top) * scaleY
                };

            } else {
                // Start is top-right, end is bottom-left
                top_left = {
                    x: (end.x - bounds.left) * scaleX,
                    y: (start.y - bounds.top) * scaleY
                };
                bottom_right = {
                    x: (start.x - bounds.left) * scaleX,
                    y: (end.y - bounds.top) * scaleX
                };
            }
        } else {
            if (start.x < end.x) {
                // Start is bottom-left, end ist top-right
                top_left = {
                    x: (start.x - bounds.left) * scaleX,
                    y: (end.y - bounds.top) * scaleY
                };
                bottom_right = {
                    x: (end.x - bounds.left) * scaleX,
                    y: (start.y - bounds.top) * scaleY
                };
            } else {
                // Start is bottom-right, end is top-left
                top_left = {
                    x: (end.x - bounds.left) * scaleX,
                    y: (end.y - bounds.top) * scaleY
                };
                bottom_right = {
                    x: (start.x - bounds.left) * scaleX,
                    y: (start.y - bounds.top) * scaleY
                };
            }
        }

        return {
            x1: top_left.x,
            y1: top_left.y,
            x2: bottom_right.x,
            y2: bottom_right.y
        };
    }
}
