import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';
import {PageNotFoundComponent} from './components/page-not-found/page-not-found.component';

const routes: Routes = [
    {path: '', pathMatch: 'full', redirectTo: '/images'},

    {
        path: 'images',
        pathMatch: 'full',
        loadChildren: 'src/app-images/images.module#ImagesModule'
    },

    {path: '*', component: PageNotFoundComponent}
];

@NgModule({
    imports: [RouterModule.forRoot(routes, {enableTracing: false})],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
