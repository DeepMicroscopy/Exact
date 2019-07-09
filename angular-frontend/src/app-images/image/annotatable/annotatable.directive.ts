import {AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {AnnotationConfigData} from '../annotation-type-config/annotation-type-config.component';
import {AnnotationInImage, Image} from '../../../network/types/image';
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
    @Input() visibleAnnotations: AnnotationInImage[];
    @Input() annotationTypes: AnnotationType[];

    private mode: AnnotationMode;
    private modes: { [vectorType: number]: AnnotationMode };

    constructor(private el: ElementRef) {
    }

    ngOnChanges(changes: SimpleChanges): void { // TODO Rework this method to be better understandable
        if (this.annotationConfig && this.imageData) {
            if (changes.imageData !== undefined ||
                (changes.annotationConfig !== undefined &&
                    (changes.annotationConfig.previousValue === undefined ||
                        changes.annotationConfig.previousValue.annotationType !== this.annotationConfig.annotationType))) {
                // Either imageData or annotationType has changed -> setup everything from scratch

                if (this.mode) {        // reset
                    this.mode.reset();
                    this.mode.result$.unsubscribe();
                }

                this.initModes();
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
                // It was a small change in the configuration which can just be pushed through
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
        if (this.visibleAnnotations && this.annotationTypes.length) {
            // Reset visible annotations on any change

            // First we reset all modes visible annotations
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i)) {
                    this.modes[i].visibleAnnotations = [];
                }
            }

            // Then we add all visible annotation to the correct mode
            for (const a of this.visibleAnnotations) {
                const vectorType = this.findAnnotationType(a.annotationType).vectorType;
                this.modes[vectorType].visibleAnnotations.push(a);
            }

            // Lastly we render the changes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i)) {
                    this.modes[i].render(+i === 1);
                }
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

        // Draw existing annotations for all other modes
        for (const i in this.modes) {
            if (this.modes.hasOwnProperty(i)) {
                this.modes[i].render(false);
            }
        }
    }

    /**
     * Initialize map of AnnotationModes ('this.modes`) with new instances.
     * This might be necessary when the imageData changes because of scaling
     */
    private initModes() {
        this.modes = {};
        this.modes[VectorType.point] = new PointAnnotationMode(this.el.nativeElement);
        this.modes[VectorType.boundingBox] = new BoundingBoxAnnotationMode(this.el.nativeElement);
        this.modes[VectorType.line] = new LineAnnotationMode(this.el.nativeElement);
    }

    /**
     * Map an AnnotationType to one of the available annotationMode
     */
    private mapAnnotationTypeToMode(): void {
        const mode = this.modes[this.annotationConfig.annotationType.vectorType];
        if (mode === undefined) {
            this.mode = null;
            alert(`${this.annotationConfig.annotationType.name} annotation mode is not yet supported`);
        } else {
            this.mode = mode;
        }
    }

    /**
     * Find the AnnotationType object based on its fields
     *
     * All given parameters must match but those left out are ignored.
     */
    protected findAnnotationType(id?: number, name?: string): AnnotationType {
        return this.annotationTypes.find(at => {
            // Return false if no parameter was given at all
            if (!id && !name) {
                return false;
            }

            // Evaluate each given parameter
            let result = true;
            if (id) {
                result = result && at.id === id;
            }
            if (name) {
                result = result && at.name === name;
            }
            return result;
        });
    }

    @HostListener('click', ['$event'])
    private onClick(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onClick(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

    @HostListener('mousemove', ['$event'])
    private onDragStart(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onMouseMove(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

    @HostListener('mouseleave', ['$event'])
    private onMouseLeave(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onMouseLeave(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

    @HostListener('mouseenter', ['$event'])
    private onMouseEnter(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onMouseEnter(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

    @HostListener('mousedown', ['$event'])
    private onMouseDown(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onMouseDown(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

    @HostListener('mouseup', ['$event'])
    private onMouseUp(event) {
        if (!this.annotationConfig.notInImage && this.mode) {
            this.mode.onMouseUp(event);

            // Draw existing annotations for all other modes
            for (const i in this.modes) {
                if (this.modes.hasOwnProperty(i) && this.modes[i] !== this.mode) {
                    this.modes[i].render(false);
                }
            }
        }
    }

}
