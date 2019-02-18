import {Injectable} from '@angular/core';
import {ImageSetService} from '../../network/rest-clients/image-set.service';
import {ActivatedRouteSnapshot, ParamMap, Resolve, Router, RouterStateSnapshot} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {EMPTY, Observable, of, zip} from 'rxjs';
import {flatMap, map, tap} from 'rxjs/operators';
import {User} from '../../network/types/user';
import {UserService} from '../../network/rest-clients/user.service';


export interface ImagesetData {
    set: ImageSet;
    creator: User<'resolved'>;
}


@Injectable({
    providedIn: 'root'
})
export class ImagesetResolverService implements Resolve<ImagesetData> {

    constructor(private imageSetService: ImageSetService, private userService: UserService, private router: Router) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<ImagesetData> {
        const imageSet$ = this.resolveImageset(route.paramMap);
        const creator$ = this.resolveCreator(imageSet$);

        // Merge all resolved resources together
        return zip(
            imageSet$,
            creator$
        ).pipe(
            flatMap(result => of({
                set: result[0],
                creator: result[1]
            } as ImagesetData))
        );
    }

    private resolveImageset(paramMap: ParamMap): Observable<ImageSet> {
        const id = paramMap.get('id');
        if (+id) {
            return this.imageSetService.read(+id).pipe(
                tap(result => {
                    if (!result) {
                        this.router.navigate(['/404']);
                    }
                })
            );
        } else {
            this.router.navigate(['/404']);
            return EMPTY;
        }
    }

    private resolveCreator(imageSet$: Observable<ImageSet>) {
        return imageSet$.pipe(
            flatMap(result => this.userService.get(result.creator)),
            tap(result => {
                if (!result) {
                    this.router.navigate(['/404']);
                }
            })
        );
    }

}
