import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {ImagesetData} from './imageset-resolver.service';
import {ImageSetService} from '../../network/rest-clients/image-set.service';

@Component({
    selector: 'app-imageset',
    templateUrl: './imageset.component.html',
    styleUrls: ['./imageset.component.scss']
})
export class ImagesetComponent implements OnInit {

    protected imageSet: ImageSet;

    constructor(private imageSetService: ImageSetService, private route: ActivatedRoute) {
    }

    ngOnInit() {
        this.route.data.subscribe((data: { imageSetData: ImagesetData }) => {
            this.imageSet = data.imageSetData.set;
        });
    }

    protected togglePin() {
        if (this.imageSet.isPinned) {
            this.imageSetService.unpin(this.imageSet.id).subscribe(() => this.imageSet.isPinned = false);
        } else {
            this.imageSetService.pin(this.imageSet.id).subscribe(() => this.imageSet.isPinned = true);
        }
    }

}
