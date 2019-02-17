import {Component, OnInit} from '@angular/core';
import {TeamService} from '../../../network/rest-clients/team.service';
import {FormControl, FormGroup} from '@angular/forms';

@Component({
    selector: 'app-create-team',
    templateUrl: './create-team.component.html',
    styleUrls: ['./create-team.component.scss']
})
export class CreateTeamComponent implements OnInit {

    protected createForm = new FormGroup({
        name: new FormControl('')
    });

    constructor(private teamService: TeamService) {
    }

    ngOnInit() {
    }

    protected onSubmit() {
    }

}
