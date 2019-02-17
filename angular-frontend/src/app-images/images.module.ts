import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {ImagesRoutingModule} from './images-routing.module';
import {ImagesComponent} from './images.component';
import { ListImagesetsComponent } from './list-imagesets/list-imagesets.component';

@NgModule({
    declarations: [ImagesComponent, ListImagesetsComponent],
    imports: [
        CommonModule,
        ImagesRoutingModule
    ],
    exports: [
        ImagesComponent
    ]
})
export class ImagesModule {
}
