
/// Bind Annotation Properties to UI
class ShowAnnotationProperties{
    constructor(viewer, exact_sync) {
        
        this.viewer = viewer;
        this.exact_sync = exact_sync;

        this.initViewerEventHandler(viewer);
    }

    initViewerEventHandler(viewer) {

        $('#AnnotationInformation').hide();

        viewer.addHandler("tool_StartAnnotationEditing", function (event) {
            
            $('#AnnotationInformation').show();

            let uuid = event.uuid;
            let annotation = event.userData.exact_sync.annotations[uuid];

            $("#annotationFirstEditor").text(annotation.user.username);
            $("#annotationFirstEditor").attr("href",`/users/user/${annotation.user.id}/`);

            $("#annotationLastEditor").text(annotation.last_editor.username);
            $("#annotationLastEditor").attr("href",`/users/user/${annotation.last_editor.id}/`);

            $("#annotationRemark").val(annotation.description);

            $("#annotationVerified").val(annotation.verified_by_user.toString());

            $("#annotationUniqueID").text(annotation.unique_identifier);
            $("#annotationUniqueID").attr("href",`/annotations/annotations_explore/?&page=1&unique_identifier=${annotation.unique_identifier}`);

            // set media file 
            if (annotation.uploaded_media_files !== undefined) {
                for (const media of annotation.uploaded_media_files) {
                    if (media.media_file_type === 4) //Audio
                    {
                        var audio = document.getElementById('audio');
                        if (audio !== undefined) {
                            var source = document.getElementById('annotationAudio');
                            source.src = media.file
                            audio.load();

                            if ($('#autoplay_media').is(':checked'))
                                audio.play();
                            break;
                        }
                    }
                }
            }
            
        }, this);

        viewer.addHandler("tool_StopedAnnotationEditing", function (event) {
            
            $('#AnnotationInformation').hide();
        }, this);

    }
}