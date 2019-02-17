import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {NetworkModule} from '../network/network.module';
import {NavbarComponent} from './components/navbar/navbar.component';
import {StorageModule} from '../storage/storage.module';
import {PageNotFoundComponent} from './components/page-not-found/page-not-found.component';
import {AuthModule} from '../auth/auth.module';

@NgModule({
    declarations: [
        AppComponent,
        NavbarComponent,
        PageNotFoundComponent
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        NetworkModule,
        StorageModule,
        AuthModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule {
}
