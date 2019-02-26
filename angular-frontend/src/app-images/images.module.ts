import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {ImagesRoutingModule} from './images-routing.module';
import {ListImagesetsComponent} from './home/list-imagesets/list-imagesets.component';
import {HomeComponent} from './home/home.component';
import {ImagesetComponent} from './imageset/imageset.component';
import {CreateTeamComponent} from './home/create-team/create-team.component';
import {ReactiveFormsModule} from '@angular/forms';
import { ImageComponent } from './image/image.component';
import { ListImagesComponent } from './list-images/list-images.component';
import { AnnotationTypeConfigComponent } from './image/annotation-type-config/annotation-type-config.component';
import { AnnotatableDirective } from './image/annotatable/annotatable.directive';

@NgModule({
    declarations: [
        ListImagesetsComponent,
        HomeComponent,
        ImagesetComponent,
        CreateTeamComponent,
        ImageComponent,
        ListImagesComponent,
        AnnotationTypeConfigComponent,
        AnnotatableDirective
    ],
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ImagesRoutingModule
    ],
    exports: []
})
export class ImagesModule {
}
