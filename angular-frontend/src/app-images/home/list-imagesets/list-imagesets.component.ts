import {Component, Input, OnInit} from '@angular/core';
import {Observable} from 'rxjs';
import {ImageSetService} from '../../../network/rest-clients/image-set.service';
import {ImageSet} from '../../../network/types/imageSet';
import {UserService} from '../../../network/rest-clients/user.service';
import {map, flatMap, tap} from 'rxjs/operators';
import {ImagesetInUser, User} from '../../../network/types/user';
import {ActivatedRoute, Router} from '@angular/router';

@Component({
    selector: 'app-list-imagesets',
    templateUrl: './list-imagesets.component.html',
    styleUrls: ['./list-imagesets.component.scss']
})
export class ListImagesetsComponent implements OnInit {

    @Input() imagesets: ImageSet[];
    @Input() user: User;

    protected visibleSets$: Observable<ImagesetInUser[]>;

    constructor(protected router: Router, protected activeRoute: ActivatedRoute) {
    }

    ngOnInit() {
        // Define visibleSets$ to be selected by route-parameter and if that parameter is an ID, filter imageSets$ to only include sets
        // from the ID's corresponding team
        this.visibleSets$ = this.activeRoute.paramMap.pipe(
            map(params => {
                const selection = params.get('visibleSet');

                if (selection === 'pinned') {
                    return this.user.pinnedSets;
                } else {
                    return this.imagesets.filter(i => i.team.id.toString() === selection);
                }
            })
        );
    }

    protected isNavActive(navSection: string | number): Observable<boolean> {
        if (typeof navSection === 'number') {
            navSection = navSection.toString();
        }

        return this.activeRoute.paramMap.pipe(
            map(params => params.get('visibleSet') === navSection),
        );
    }

}
