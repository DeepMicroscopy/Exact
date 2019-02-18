import {Component, OnInit} from '@angular/core';
import {combineLatest, Observable} from 'rxjs';
import {ImageSetService} from '../../../network/rest-clients/image-set.service';
import {ImageSet} from '../../../network/types/imageSet';
import {UserService} from '../../../network/rest-clients/user.service';
import {map, flatMap, filter, tap} from 'rxjs/operators';
import {User} from '../../../network/types/user';
import {ActivatedRoute, Router} from '@angular/router';
import {TeamService} from '../../../network/rest-clients/team.service';

@Component({
    selector: 'app-list-imagesets',
    templateUrl: './list-imagesets.component.html',
    styleUrls: ['./list-imagesets.component.scss']
})
export class ListImagesetsComponent implements OnInit {

    private imageSets$: Observable<ImageSet[]>;
    private pinnedSets$: Observable<ImageSet[]>;
    protected visibleSets$: Observable<ImageSet[]>;
    protected user$: Observable<User<'resolved'>>;

    constructor(protected imageSetService: ImageSetService, protected userService: UserService, protected teamService: TeamService,
                protected router: Router, protected activeRoute: ActivatedRoute) {
    }

    ngOnInit() {
        this.imageSets$ = this.imageSetService.list();
        this.user$ = this.userService.get('me');

        // Define pinnedSets$ as those sets of imageSets$ which's id is included in the users pinnedSets array
        this.pinnedSets$ = this.imageSets$.pipe(
            map(sets => sets.filter(set => set.isPinned))
        );

        // Define visibleSets$ to be selected by route-parameter and if that parameter is an ID, filter imageSets$ to only include sets
        // from the ID's corresponding team
        this.visibleSets$ = this.activeRoute.paramMap.pipe(
            flatMap(params => {
                const selection = params.get('visibleSet');
                if (selection === 'pinned') {
                    return this.pinnedSets$;
                } else {
                    return this.imageSets$.pipe(
                        map(sets => sets.filter(i => i.team.id.toString() === selection))
                    );
                }
            })
        );
    }

    protected isNavActive(navSection: string | number): Observable<boolean> {
        if (typeof navSection === 'number') {
            navSection = navSection.toString();
        }

        return this.activeRoute.paramMap.pipe(
            map(params => params.get('visibleSet') === navSection)
        );
    }

}
