import {Component, OnInit} from '@angular/core';
import {combineLatest, Observable} from 'rxjs';
import {ImageSetService} from '../../network/rest-clients/image-set.service';
import {ImageSet} from '../../network/types/imageSet';
import {UserService} from '../../network/rest-clients/user.service';
import {map} from 'rxjs/operators';
import {User} from '../../network/types/user';
import {ActivatedRoute, Router} from '@angular/router';
import {TeamService} from '../../network/rest-clients/team.service';

@Component({
    selector: 'app-list-imagesets',
    templateUrl: './list-imagesets.component.html',
    styleUrls: ['./list-imagesets.component.scss']
})
export class ListImagesetsComponent implements OnInit {

    // protected teams: Observable<Team<'simple'>[]>;
    protected imageSets$: Observable<ImageSet[]>;
    protected pinnedSets$: Observable<ImageSet[]>;
    protected user$: Observable<User<'resolved'>>;

    constructor(protected imageSetService: ImageSetService, protected userService: UserService,
                protected router: Router, protected activeRoute: ActivatedRoute) {
    }

    ngOnInit() {
        this.imageSets$ = this.imageSetService.list();
        this.user$ = this.userService.get('me');

        // Define pinnedSets$ as those sets of imageSets$ which's id is included in the users pinnedSets array
        this.pinnedSets$ = combineLatest(this.user$, this.imageSets$).pipe(
            map(result => {
                const user: User<'resolved'> = result[0];
                const imageSets: ImageSet[] = result[1];
                return imageSets.filter(i => user.pinnedSets.includes(i));
            })
        );
    }

    protected isNavActive(navSection: string): Observable<boolean> {
        return this.activeRoute.paramMap.pipe(
            map(params => params.has('visibleSet') && params.get('visibleSet') === navSection)
        );
    }

}
