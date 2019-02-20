import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {ImagesData} from './image-resolver.service';
import {ImagesetData} from '../imageset/imageset-resolver.service';
import {ImageSet} from '../../network/types/imageSet';
import {Image} from '../../network/types/image';
import {FormControl, FormGroup} from '@angular/forms';
import {AnnotationType} from '../../network/types/annotationType';
import {environment} from '../../environments/environment';
import {AnnotationService} from '../../network/rest-clients/annotation.service';

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

    protected annotationConfigForm = new FormGroup({
        annotationType: new FormControl(''),
        notInImage: new FormControl(false),
        blurred: new FormControl(false),
        concealed: new FormControl(false),
    });

    protected keepAnnotationForNextImage = new FormControl(true);

    constructor(private route: ActivatedRoute, private router: Router, private annotationService: AnnotationService) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: { imageSetData: ImagesetData, imagesData: ImagesData }) => {
            this.image = data.imagesData.image;
            this.annotationTypes = data.imagesData.annotationTypes;
            this.imageset = data.imageSetData.set;

            // Set default selected annotationType to the imagesets mainAnnotationType
            if (this.imageset.mainAnnotationType) {
                this.annotationConfigForm.patchValue({
                    annotationType: this.findAnnotationType(this.imageset.mainAnnotationType).name
                });
            }
        });

        this.annotationConfigForm.valueChanges.subscribe(console.log);
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

    protected actDeleteAnnotation(id: number) {
        this.annotationService.delete(id).subscribe(result => {
            if (result) {
                this.router.navigate([]);
            }
        });
    }

}
