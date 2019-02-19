import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ImagesData} from './image-resolver.service';
import {ImagesetData} from '../imageset/imageset-resolver.service';
import {ImageSet} from '../../network/types/imageSet';
import {Image} from '../../network/types/image';
import {FormControl, FormGroup} from '@angular/forms';
import {AnnotationType} from '../../network/types/annotationType';
import {environment} from '../../environments/environment';

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
        annotationType: new FormControl(),
        notInImage: new FormControl(false),
        blurred: new FormControl(false)
    });

    protected keepAnnotationForNextImage = new FormControl(true);

    constructor(private route: ActivatedRoute) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: { imageSetData: ImagesetData, imagesData: ImagesData }) => {
            this.image = data.imagesData.image;
            this.annotationTypes = data.imagesData.annotationTypes;
            this.imageset = data.imageSetData.set;
        });
    }

}
