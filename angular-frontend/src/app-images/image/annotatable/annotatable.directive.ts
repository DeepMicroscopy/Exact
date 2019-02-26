import {AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {AnnotationConfigData} from '../annotation-type-config/annotation-type-config.component';
import {Image} from '../../../network/types/image';
import {AnnotationMode, PrematureAnnotation} from './annotation-mode';
import {VectorType} from '../../../network/types/annotationType';
import {BoundingBoxAnnotationMode} from './bounding-box.annotation-mode';


@Directive({
    selector: 'canvas[appAnnotatable]',
})
export class AnnotatableDirective implements OnChanges, AfterViewInit {

    @Output() currentDrawing: EventEmitter<PrematureAnnotation | null> = new EventEmitter(true);

    @Input() annotationConfig: AnnotationConfigData;
    @Input() imageData: Image;

    private mode: AnnotationMode;

    constructor(private el: ElementRef) {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.annotationConfig && this.imageData) {
            const canvas: HTMLCanvasElement = this.el.nativeElement;
            if (this.mode) {
                this.mode.reset();
            }
            this.map_annotation_mode();
            if (this.mode) {
                this.mode.handle(canvas).subscribe(value => this.currentDrawing.emit(value));
            }
        }
    }

    ngAfterViewInit(): void {
        const canvas: HTMLCanvasElement = this.el.nativeElement;

        // Setup width and height for scaling
        canvas.width = this.imageData.width;
        canvas.height = this.imageData.height;
    }

    private map_annotation_mode(): void {
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

}
