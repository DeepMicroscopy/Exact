import {AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {AnnotationConfigData} from '../annotation-type-config/annotation-type-config.component';
import {Image} from '../../../network/types/image';
import {AnnotationMode} from './annotation-mode';
import {AnnotationType, VectorType} from '../../../network/types/annotationType';
import {BoundingBoxAnnotationMode} from './bounding-box.annotation-mode';
import {AnnotationVector} from '../../../network/types/annotation';
import {PointAnnotationMode} from './point.annotation-mode';
import {LineAnnotationMode} from './line.annotation-mode';


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

    @Output() prematureAnnotationChanges: EventEmitter<PrematureAnnotation | null> = new EventEmitter(true);

    @Input() annotationConfig: AnnotationConfigData;
    @Input() imageData: Image;

    private mode: AnnotationMode;

    constructor(private el: ElementRef) {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.annotationConfig && this.imageData) {
            if (changes.imageData !== undefined ||
                (changes.annotationConfig !== undefined &&
                    changes.annotationConfig.previousValue === undefined ||
                    changes.annotationConfig.previousValue.annotationType !== this.annotationConfig.annotationType)) {
                // Either imageData or annotationType has changed -> setup everything from scratch

                if (this.mode) {        // reset
                    this.mode.reset();
                    this.mode.result$.unsubscribe();
                }

                this.mapAnnotationTypeToMode();
                if (this.mode) {
                    this.mode.result$.subscribe(value => {
                        if (value) {
                            this.prematureAnnotationChanges.emit({
                                annotationType: this.annotationConfig.annotationType,
                                concealed: this.annotationConfig.concealed,
                                blurred: this.annotationConfig.blurred,
                                notInImage: this.annotationConfig.notInImage,
                                vector: value,
                                image: this.imageData
                            });
                        } else {
                            this.prematureAnnotationChanges.emit(null);
                        }
                    });
                }

            } else {
                // It was a small change which can just be pushed
                this.prematureAnnotationChanges.emit({
                    annotationType: this.annotationConfig.annotationType,
                    concealed: this.annotationConfig.concealed,
                    blurred: this.annotationConfig.blurred,
                    notInImage: this.annotationConfig.notInImage,
                    vector: (this.mode ? this.mode.result$.getValue() : null),
                    image: this.imageData
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

    public reset() {
        if (this.mode) {
            this.mode.reset();
        }
    }

    /**
     * Map an AnnotationType to one of the available annotationMode
     */
    private mapAnnotationTypeToMode(): void {
        switch (this.annotationConfig.annotationType.vectorType) {
            case VectorType.point:
                this.mode = new PointAnnotationMode((this.el.nativeElement));
                break;
            case VectorType.boundingBox:
                this.mode = new BoundingBoxAnnotationMode(this.el.nativeElement);
                break;
            case VectorType.line:
                this.mode = new LineAnnotationMode(this.el.nativeElement);
                break;
            default:
                this.mode = null;
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
            this.mode.onMouseLeave(event);
        }
    }

    @HostListener('mouseenter', ['$event'])
    private onMouseEnter(event) {
        if (this.mode) {
            this.mode.onMouseEnter(event);
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
