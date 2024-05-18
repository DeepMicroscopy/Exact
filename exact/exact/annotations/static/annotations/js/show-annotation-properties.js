
/* Get area of a polygon/surface */
function polygon_area(vector) {
    let total = 0;

    let len = Object.keys(vector).length/2
    for (let i = 1; i <= len; i++) {
        
        const addX = vector["x" + i];
        const addY = vector["y" + (i === len ? 1 : i + 1)];
        const subX = vector["x" + (i === len ? 1 : i + 1)];
        const subY = vector["y" + i];
        total += (addX * addY * 0.5) - (subX * subY * 0.5);
    }
    return Math.abs(total);
}

function rect_area(vector)
{
    return Math.round((vector["x2"]-vector["x1"])*(vector["y2"]-vector["y1"]))
}

function line_length(vector) {
    return Math.round(Math.sqrt(Math.pow(vector["x2"]-vector["x1"],2)+Math.pow(vector["y2"]-vector["y1"],2)))
}

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

            if (annotation !== undefined) {

                $("#annotationFirstEditor").text(annotation.user.username);
                $("#annotationFirstEditor").attr("href", include_server_subdir(`/users/user/${annotation.user.id}/`));
    
                $("#annotationLastEditor").text(annotation.last_editor.username);
                $("#annotationLastEditor").attr("href", include_server_subdir(`/users/user/${annotation.last_editor.id}/`));

                if (annotation.annotation_type.vector_type==3) // line
                    {
                        $("#annotationSizeLengthLabel").html('Length (px)');
                        $("#annotationSize").text(line_length(annotation.vector));
                    }
                else 
                {   
                    $("#annotationSizeLengthLabel").html('Area (px^2)');
                    if (annotation.annotation_type.vector_type==1) // rect
                    {
                        $("#annotationSize").text(rect_area(annotation.vector));
            
                    }
                    else
                    {
                        $("#annotationSize").text(polygon_area(annotation.vector));
                    }
                }
                $("#annotationRemark").val(annotation.description);
    
                if (annotation.verified_by_user !== undefined)
                    $("#annotationVerified").val(annotation.verified_by_user.toString());
                else
                    $("#annotationVerified").val("");
    
                $("#annotationUniqueID").text(annotation.unique_identifier);
                $("#annotationUniqueID").attr("href", include_server_subdir(`/annotations/annotations_explore/?&page=1&unique_identifier=${annotation.unique_identifier}`));
    
                // set media file 
                if (annotation.uploaded_media_files !== undefined) {
                    for (const media of annotation.uploaded_media_files) {
                        if (media.media_file_type === 4) //Audio
                        {
                            var audio = document.getElementById('audio');
                            if (audio !== undefined) {
                                var source = document.getElementById('annotationAudio');
                                source.src = include_server_subdir("/media" + media.file.split("media")[1])
                                audio.load();
    
                                if ($('#autoplay_media').is(':checked'))
                                    audio.play();
                                break;
                            }
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