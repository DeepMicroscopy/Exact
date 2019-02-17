import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {ImagesRoutingModule} from './images-routing.module';
import {ListImagesetsComponent} from './home/list-imagesets/list-imagesets.component';
import {HomeComponent} from './home/home.component';

@NgModule({
    declarations: [ListImagesetsComponent, HomeComponent],
    imports: [
        CommonModule,
        ImagesRoutingModule
    ],
    exports: [
    ]
})
export class ImagesModule {
}
