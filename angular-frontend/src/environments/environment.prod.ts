import {ErrorHandler} from '@angular/core';


export const environment = {
    production: true,
    apiUrl: '',     // TODO Configure production API Url
    sessionStoragePrefix: 'imagetagger',
    localStoragePrefix: 'imagetagger'
};


export class RavenErrorHandler implements ErrorHandler { // TODO Configure actual Raven reporting
    handleError(error: any): void {
        console.error(error.toString());
    }
}
