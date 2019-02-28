import {AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {AnnotationConfigData} from '../annotation-type-config/annotation-type-config.component';
import {Image} from '../../../network/types/image';
import {AnnotationMode} from './annotation-mode';
import {AnnotationType, VectorType} from '../../../network/types/annotationType';
import {BoundingBoxAnnotationMode} from './bounding-box.annotation-mode';
import {AnnotationVector} from '../../../network/types/annotation';


export interface PrematureAnnotation {
    annotationType: AnnotationType;
    blurred: boolean;
    concealed: boolean;
    notInImage: boolean;
    image: Image;
    vector: AnnotationVector | null;
}


@Directive({
    selector: 'canvas[appAnnotatable]',
})
export class AnnotatableDirective implements OnChanges, AfterViewInit {

    @Output() annotationChange: EventEmitter<PrematureAnnotation> = new EventEmitter(true);

    @Input() annotationConfig: AnnotationConfigData;
    @Input() imageData: Image;

    private mode: AnnotationMode;

    constructor(private el: ElementRef) {
    }

    ngOnChanges(changes: SimpleChanges): void { // TODO Push out an update whenever annotationConfig changes
        if (this.annotationConfig && this.imageData) {
            if (this.mode) {
                this.mode.result$.unsubscribe();
                this.mode.reset();
            }
            this.mapAnnotationTypeToMode();
            if (this.mode) {
                this.mode.result$.subscribe(value => {
                    this.annotationChange.emit({
                        annotationType: this.annotationConfig.annotationType,
                        image: this.imageData,
                        blurred: this.annotationConfig.blurred,
                        concealed: this.annotationConfig.concealed,
                        notInImage: this.annotationConfig.notInImage,
                        vector: value
                    });
                });
            }
        }
    }

    ngAfterViewInit(): void {
        const canvas: HTMLCanvasElement = this.el.nativeElement;

        // Setup width and height for scaling
        canvas.width = this.imageData.width;
        canvas.height = this.imageData.height;
    }

    /**
     * Map an AnnotationType to one of the available annotationMode
     */
    private mapAnnotationTypeToMode(): void {
        if (this.annotationConfig.annotationType.vectorType === VectorType.boundingBox) {
            this.mode = new BoundingBoxAnnotationMode(this.el.nativeElement);

        } else {
            alert(`${this.annotationConfig.annotationType.name} annotation mode is not yet supported`);
        }
    }

    @HostListener('click', ['$event'])
    private onClick(event) {
        if (this.mode) {
            this.mode.onClick(event);
        }
    }

    @HostListener('mousemove', ['$event'])
    private onDragStart(event) {
        if (this.mode) {
            this.mode.onMouseMove(event);
        }
    }

    @HostListener('mouseleave', ['$event'])
    private onMouseLeave(event) {
        if (this.mode) {
            this.mode.reset();
            this.mode.onMouseLeave(event);
        }
    }

    @HostListener('mousedown', ['$event'])
    private onMouseDown(event) {
        if (this.mode) {
            this.mode.onMouseDown(event);
        }
    }

    @HostListener('mouseup', ['$event'])
    private onMouseUp(event) {
        if (this.mode) {
            this.mode.onMouseUp(event);
        }
    }

}
