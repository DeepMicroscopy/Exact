import {Injectable} from '@angular/core';
import {ImageSetService} from '../../network/rest-clients/image-set.service';
import {ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot} from '@angular/router';
import {ImageSet} from '../../network/types/imageSet';
import {EMPTY, Observable, of} from 'rxjs';
import {flatMap, map} from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class ImagesetResolverService implements Resolve<ImageSet> {

    constructor(private imageSetService: ImageSetService, private router: Router) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<ImageSet> {
        const id = route.paramMap.get('id');
        if (+id) {
            return this.imageSetService.read(+id).pipe(
                flatMap(set => {
                    if (set) {
                        return of(set);
                    } else {
                        this.router.navigate(['/404']);
                        return EMPTY;
                    }
                })
            );
        } else {
            return EMPTY;
        }
    }
}
