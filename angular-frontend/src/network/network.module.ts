import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HTTP_INTERCEPTORS, HttpClientModule} from '@angular/common/http';
import {StorageModule} from '../storage/storage.module';
import {HttpCachingInterceptor} from './http/caching-http.service';


const httpInterceptorProviders = [
    {provide: HTTP_INTERCEPTORS, useClass: HttpCachingInterceptor, multi: true}
];


@NgModule({
    declarations: [],
    imports: [
        CommonModule,
        HttpClientModule,
        StorageModule
    ],
    exports: [],
    providers: [
        httpInterceptorProviders
    ]
})
export class NetworkModule {
}
