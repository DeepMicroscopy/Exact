import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {ImagesetData} from './imageset-resolver.service';
import {User} from '../../network/types/user';

@Component({
    selector: 'app-imageset',
    templateUrl: './imageset.component.html',
    styleUrls: ['./imageset.component.scss']
})
export class ImagesetComponent implements OnInit {

    protected imageSet: ImageSet;
    protected creator: User<'resolved'>;

    constructor(private route: ActivatedRoute) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: { imageSetData: ImagesetData }) => {
            this.imageSet = data.imageSetData.set;
            this.creator = data.imageSetData.creator;
        });
    }

}
