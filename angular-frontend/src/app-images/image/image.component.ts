import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, ParamMap, Router} from '@angular/router';
import {ImagesData} from './image-resolver.service';
import {ImagesetData} from '../imageset/imageset-resolver.service';
import {ImageSet} from '../../network/types/imageSet';
import {Image} from '../../network/types/image';
import {FormControl} from '@angular/forms';
import {AnnotationType} from '../../network/types/annotationType';
import {environment} from '../../environments/environment';
import {AnnotationService} from '../../network/rest-clients/annotation.service';
import {combineLatest} from 'rxjs';
import {AnnotationConfigData} from './annotation-type-config/annotation-type-config.component';
import {PrematureAnnotation} from './annotatable/annotatable.directive';
import {AnnotationVector} from '../../network/types/annotation';
import {hasOwnProperty} from 'tslint/lib/utils';


@Component({
    selector: 'app-image',
    templateUrl: './image.component.html',
    styleUrls: ['./image.component.scss']
})
export class ImageComponent implements OnInit {

    protected mediaUrl = environment.mediaUrl;
    protected imageset: ImageSet;
    protected image: Image;
    protected annotationTypes: AnnotationType[];

    protected keepAnnotationForNextImage = new FormControl(true);

    protected annotationConfigData: AnnotationConfigData;
    protected prematureAnnotation: PrematureAnnotation;

    constructor(private route: ActivatedRoute, private router: Router, private annotationService: AnnotationService) {
    }

    ngOnInit() {
        combineLatest(
            this.route.data,
            this.route.queryParamMap,
        ).subscribe((values) => {
            const data = values[0] as { imageSetData: ImagesetData, imagesData: ImagesData };
            const queryParams = values[1] as ParamMap;

            this.image = data.imagesData.image;
            this.annotationTypes = data.imagesData.annotationTypes;
            this.imageset = data.imageSetData.set;
        });
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

    /**
     * Convert an AnnotationVector to an Iterable because *ngFor needs that
     */
    protected annotationVectorToIterable(vector: AnnotationVector): {key: string, value: string}[] {
        const result: {key: string, value: string}[] = [];

        for (const i in vector) {
            if (vector.hasOwnProperty(i)) {
                result.push({key: i.toString(), value: vector[i].toString()});
            }
        }

        return result;
    }

    /**
     * Delete the annotation with the provided ID and update `this.image.annotations`.
     */
    protected actDeleteAnnotation(id: number) {
        this.annotationService.delete(id).subscribe(result => {
            if (result) {
                this.image.annotations = this.image.annotations.filter(a => a.id !== id);
            }
        });
    }

    /**
     * Save the current premature-annotation
     */
    protected actSave() {
        console.log('Save pressed');
    }

}
