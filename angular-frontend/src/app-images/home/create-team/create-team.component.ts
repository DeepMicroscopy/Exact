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
        const name = this.createForm.value.name as string;
        this.teamService.create(name).subscribe(success => {
            if (success) {
                alert('Team was successfully created'); // TODO Reroute to newly created teams page
            } else {
                alert('That didn\'t work');
            }
        });
    }

}
