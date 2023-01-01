class TeamTool {
    constructor (viewer, team_id) {

        this.viewer = viewer;
        this.team_sync = new EXACTTeamSync(viewer, team_id);

        viewer.addHandler("sync_TeamLoaded", function (event) {

            event.userData.initUiEvents();
        }, this);
    }

    initUiEvents () {

        $('#ShowUserCreatedAnnotationsToggle').change(this.toggleUserCreatedAnnotationsVisibilityAll.bind(this)); 
        $('#ShowUserLastEditedAnnotationsToggle').change(this.toggleUserLastEditedAnnotationsVisibilityAll.bind(this)); 

        for (let member of Object.values(this.team_sync.users)) {
            $('#ShowUserCreatedAnnotations_' + member.id).change(this.toogleUserCreadedAnnotationsVisibility.bind(this)); 
            $('#ShowUserLastEditedAnnotations_' + member.id).change(this.toogleUserLastEditedAnnotationsVisibility.bind(this)); 
        }

    }

    toggleUserCreatedAnnotationsVisibilityAll(event) {
        let checked = event.currentTarget.checked;

        for (let member of Object.values(this.team_sync.users)) {
            $('#ShowUserCreatedAnnotations_' + member.id).prop('checked', checked);
            this.viewer.raiseEvent('team_ChangeCreatorAnnotationsVisibility', { "User": member.id, "Checked": checked });
        }
    }

    toggleUserLastEditedAnnotationsVisibilityAll(event) {
        let checked = event.currentTarget.checked;

        for (let member of Object.values(this.team_sync.users)) {
            $('#ShowUserLastEditedAnnotations_' + member.id).prop('checked', checked);
            this.viewer.raiseEvent('team_ChangeLastEditedAnnotationsVisibility', { "User": member.id, "Checked": checked });
        }
    }

    toogleUserCreadedAnnotationsVisibility(event) {

        let user_id = parseInt(event.target.dataset.user_id);
        let checked = event.currentTarget.checked;

        this.viewer.raiseEvent('team_ChangeCreatorAnnotationsVisibility', { "User": user_id, "Checked": checked });
    }

    toogleUserLastEditedAnnotationsVisibility(event) {
        
        let user_id = parseInt(event.target.dataset.user_id);
        let checked = event.currentTarget.checked;

        this.viewer.raiseEvent('team_ChangeLastEditedAnnotationsVisibility', { "User": user_id, "Checked": checked });
    }

    destroy() { 

        $('#ShowUserCreatedAnnotationsToggle').off("change");
        $('#ShowUserLastEditedAnnotationsToggle').off("change");

        for (let member of Object.values(this.team_sync.users)) {
            $('#ShowUserCreatedAnnotations_' + member.id).off("change");
            $('#ShowUserLastEditedAnnotations_' + member.id).off("change");  
        }
    }
}