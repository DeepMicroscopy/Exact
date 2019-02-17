import {Component, OnInit} from '@angular/core';
import {UserService} from '../../../network/rest-clients/user/user.service';
import {AuthService} from '../../../auth/auth.service';

@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit {

    constructor(protected userService: UserService, protected authService: AuthService) {
    }

    ngOnInit() {
    }

}
