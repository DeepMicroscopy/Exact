import {Injectable} from '@angular/core';
import {LocalStorageService} from '../storage/local-storage.service';
import {Observable, of} from 'rxjs';
import {HttpClient} from '@angular/common/http';
import {environment} from '../environments/environment';
import {catchError, map} from 'rxjs/operators';
import {Router} from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {

    public url = environment.apiUrl + 'auth/';
    public redirectUrl = '/';

    private authToken: string = null;

    constructor(private storage: LocalStorageService, private http: HttpClient, private router: Router) {
        this.authToken = this.storage.getItem('authToken');
    }

    /**
     * Login as the user whose credentials are provided.
     *
     * It does not matter if another user is already logged in. The new login will take precedence.
     *
     * @param username Users username
     * @param password Plain-text password
     * @param remember Whether the login should be remembered. No password will be saved but rather a token
     */
    public login(username: string, password: string, remember: boolean): Observable<boolean> {
        this.logout();
        return this.http.post(this.url, {
            username: username,
            password: password
        }).pipe(
            map(result => {
                if (result['token'] !== undefined) {
                    this.authToken = result['token'];
                    if (remember) {
                        this.storage.setItem('authToken', this.authToken);
                    }
                    this.router.navigate([this.redirectUrl]);
                    this.redirectUrl = '/';
                    return true;
                }
                return false;
            }),
            catchError(() => of(false))
        );
    }

    /**
     * Logout the current user deleting all user-specific storage-values
     */
    public logout() {
        this.authToken = null;
        this.storage.removeItem('authToken');
    }

    public isLoggedIn(): boolean {
        return this.authToken !== null;
    }

}
