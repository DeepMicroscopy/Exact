import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ImagesData} from './image-resolver.service';
import {ImagesetData} from '../imageset/imageset-resolver.service';

@Component({
    selector: 'app-image',
    templateUrl: './image.component.html',
    styleUrls: ['./image.component.scss']
})
export class ImageComponent implements OnInit {

    private imagesData: ImagesData;
    private imagesetData: ImagesetData;

    constructor(private route: ActivatedRoute) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: {imageSetData: ImagesetData, imagesData: ImagesData}) => {
            this.imagesData = data.imagesData;
            this.imagesetData = data.imageSetData;
        });
    }

}
