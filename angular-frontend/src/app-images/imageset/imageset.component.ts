import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {ImagesetData} from './imageset-resolver.service';

@Component({
    selector: 'app-imageset',
    templateUrl: './imageset.component.html',
    styleUrls: ['./imageset.component.scss']
})
export class ImagesetComponent implements OnInit {

    protected imageSet: ImageSet;

    constructor(private route: ActivatedRoute) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: { imageSetData: ImagesetData }) => {
            this.imageSet = data.imageSetData.set;
        });
    }

}
