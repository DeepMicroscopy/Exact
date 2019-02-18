// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import {ErrorHandler} from '@angular/core';


export const environment = {
    production: false,
    apiUrl: 'http://localhost:8000/api/',
    sessionStoragePrefix: 'imagetagger',
    localStoragePrefix: 'imagetagger'
};


export class RavenErrorHandler implements ErrorHandler {
    handleError(error: any): void {
        if (error.toString() !== '[object Object]') {
            console.error(error.toString());
        } else {
            console.error(error);
        }
    }
}
