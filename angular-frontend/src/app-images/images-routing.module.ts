import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {HomeComponent} from './home/home.component';
import {ImagesetComponent} from './imageset/imageset.component';
import {ImagesetResolverService} from './imageset/imageset-resolver.service';
import {ImageComponent} from './image/image.component';
import {ImageResolverService} from './image/image-resolver.service';
import {HomeResolverService} from './home/home-resolver.service';

const routes: Routes = [
    {path: '', pathMatch: 'full', redirectTo: 'pinned'},
    {path: 'imagesets', pathMatch: 'full', redirectTo: 'pinned'},
    {
        path: ':visibleSet', pathMatch: 'full', component: HomeComponent, resolve: {
            homeData: HomeResolverService
        }
    },
    {
        path: 'imagesets/:imagesetId', pathMatch: 'full', component: ImagesetComponent, resolve: {
            imageSetData: ImagesetResolverService,
        }
    },
    {
        path: 'imagesets/:imagesetId/image/:imageId', pathMatch: 'full', component: ImageComponent, runGuardsAndResolvers: 'always', resolve: {
            imageSetData: ImagesetResolverService,
            imagesData: ImageResolverService,
        },
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class ImagesRoutingModule {
}
