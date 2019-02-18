import {Injectable} from '@angular/core';
import {ImageSetService} from '../../network/rest-clients/image-set.service';
import {ActivatedRouteSnapshot, ParamMap, Resolve, Router, RouterStateSnapshot} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {EMPTY, Observable, of, zip} from 'rxjs';
import {flatMap, map, tap} from 'rxjs/operators';
import {UserService} from '../../network/rest-clients/user.service';


export interface ImagesetData {
    set: ImageSet;
}


@Injectable({
    providedIn: 'root'
})
export class ImagesetResolverService implements Resolve<ImagesetData> {

    constructor(private imageSetService: ImageSetService, private userService: UserService, private router: Router) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<ImagesetData> {
        const imageSet$ = this.resolveImageset(route.paramMap);

        // Merge all resolved resources together
        return zip(
            imageSet$
        ).pipe(
            flatMap(result => of({
                set: result[0]
            } as ImagesetData))
        );
    }

    private resolveImageset(paramMap: ParamMap): Observable<ImageSet> {
        const id = paramMap.get('imagesetId');
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

}
