import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AbstractControl, FormControl, FormGroup, ValidationErrors} from '@angular/forms';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {combineLatest} from 'rxjs';
import {AnnotationType} from '../../../network/types/annotationType';
import {ImageSet} from '../../../network/types/imageSet';
import {filter, map} from 'rxjs/operators';


export interface AnnotationConfigData {
    annotationType: string;
    notInImage: boolean;
    blurred: boolean;
    concealed: boolean;
    valid: boolean;
}


@Component({
    selector: 'app-annotation-type-config',
    templateUrl: './annotation-type-config.component.html',
    styleUrls: ['./annotation-type-config.component.scss']
})
export class AnnotationTypeConfigComponent implements OnInit {

    @Output() update: EventEmitter<AnnotationConfigData> = new EventEmitter(true);

    protected annotationTypes: AnnotationType[];
    protected imageset: ImageSet;

    protected form = new FormGroup({
        annotationType: new FormControl('', notEmptyValidator),
        notInImage: new FormControl(false),
        blurred: new FormControl(false),
        concealed: new FormControl(false),
    });

    constructor(private route: ActivatedRoute, private router: Router) {
    }

    ngOnInit() {
        console.log('onChanges');
        // Send out an update whenever the form changes to a valid value
        this.form.valueChanges.pipe(
            map(update => {
                update.valid = this.form.valid;
                return update;
            })
        ).subscribe((update: AnnotationConfigData) => {
            this.update.emit(update);
        });

        // Setup form and other data
        combineLatest(
            this.route.data,
            this.route.queryParamMap
        ).subscribe(value => {
            const data = value[0];
            const queryParams = value[1];

            this.annotationTypes = data.imagesData.annotationTypes;
            this.imageset = data.imageSetData.set;

            this.setupAnnotationType(queryParams);
        });
    }

    /**
     * Setup the starting AnnotationType to be the URL parameter or the imagesets mainAnnotationType
     */
    private setupAnnotationType(queryParams: ParamMap) {
        let annotationType = '';

        if (queryParams.has('annotationType')) {
            // Set annotationType from URL query parameter
            annotationType = this.findAnnotationType(null, queryParams.get('annotationType')).name;
        } else if (this.imageset.mainAnnotationType) {
            // Set default selected annotationType to the imagesets mainAnnotationType
            annotationType = this.findAnnotationType(this.imageset.mainAnnotationType).name;
        }

        if (annotationType !== this.form.value.annotationType) {
            this.form.patchValue({
                annotationType: annotationType
            });
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
}


function notEmptyValidator(control: AbstractControl): ValidationErrors | null {
    return (control.value !== '' && control.value !== null && control.value !== undefined) ?
        null :
        {'notEmpty': 'The value is not empty'};
}
