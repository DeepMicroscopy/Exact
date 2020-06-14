// JS file for sync annotations with the EXACT Server



class EXACTAnnotationSync {

    constructor(annotationTypes, imageId, gHeaders,
        viewer, username, limit = 250, updateInterval = 30000) {

        this.interruptLoading = false; // Stop loading annotations
        this.username = username; // document.getElementById("username").innerText.trim() 
        this.viewer = viewer; // just for notification reasons remove later!
        this.annotations = {};
        this.global_annotations = {};
        this.annotationTypes = annotationTypes;
        this.imageId = imageId;
        this.gHeaders = gHeaders;
        this.statistics = {};
        this.resumeLoadAnnotationsCache = {}

        this.lastUpdateTimePoint = new Date(Date.now());
        this.refreshAnnotationsFromServer;
        this.upDateFromServerInterval = updateInterval;

        this.API_1_ANNOTATIONS_BASE_URL = '/api/v1/annotations/';
        this.API_1_ANNOTATION_EXPAND = 'expand=user,last_editor,uploaded_media_files&';
        this.API_1_ANNOTATION_FIELDS = 'fields=image,annotation_type,id,vector,deleted,description,verified_by_user,uploaded_media_files,unique_identifier,user.id,user.username,last_editor.id,last_editor.username&';

        this.initLoadAnnotations(annotationTypes, imageId)
        this.refreshAnnotationsFromServer = setInterval(function (context) {

            //2020-05-03+09:52:01
            var date = context.lastUpdateTimePoint;
            var time = `${
                date.getFullYear().toString().padStart(4, '0')}-${
                (date.getMonth() + 1).toString().padStart(2, '0')}-${
                date.getDate().toString().padStart(2, '0')}+${
                date.getHours().toString().padStart(2, '0')}:${
                date.getMinutes().toString().padStart(2, '0')}:${
                date.getSeconds().toString().padStart(2, '0')}`

            let filter = 'image=' + imageId + '&' + "last_edit_time__gte=" + time + "&";
            context.lastUpdateTimePoint = new Date(Date.now());
            let url = context.API_1_ANNOTATIONS_BASE_URL + 'annotations/?limit=50&' + filter + context.API_1_ANNOTATION_EXPAND + context.API_1_ANNOTATION_FIELDS;

            context.loadAnnotationsWithConditions(url, imageId, context);
        }, this.upDateFromServerInterval, this);
    }

    initLoadAnnotations(annotationTypes, imageId, limit = 250) {
        for (annotation_type of Object.values(annotationTypes)) {

            this.statistics[annotation_type.id] = {
                total: 0,
                loaded: false,
                verified: 0
            }

            let filter = 'image=' + imageId + '&';
            filter += 'annotation_type=' + annotation_type.id + '&';

            let url = `${this.API_1_ANNOTATIONS_BASE_URL}annotations/?limit=${limit}&${filter}${this.API_1_ANNOTATION_EXPAND}${this.API_1_ANNOTATION_FIELDS}`
            this.loadAnnotations(url, imageId, this, annotation_type)
        }
    }

    stopLoadAnnotationsCache() {
        this.interruptLoading = true;
    }

    resumeLoadAnnotationsCache() {
        this.interruptLoading = false;

        for (var annotation_type in this.resumeLoadAnnotationsCache) {
            let url = this.resumeLoadAnnotationsCache[annotation_type].url;

            loadAnnotations(url, this.imageId, this, annotation_type)
        }
    }

    loadAnnotations(url, imageId, context, annotation_type = undefined) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {

                for (let anno of data.results) {
                    // set annoation type
                    anno.annotation_type = context.annotationTypes[anno.annotation_type];
                    context.annotations[anno.unique_identifier] = anno;
                }

                if (data.results.length > 0) {
                    let annotations = data.results;
                    context.viewer.raiseEvent('sync_drawAnnotations', { annotations });
                }

                if (data.next !== null) {
                    // if the image instance should load more annotation but has a stop command save the next commands
                    let url = context.API_1_ANNOTATIONS_BASE_URL + data.next.split(context.API_1_ANNOTATIONS_BASE_URL)[1]
                    if (context.interruptLoading === false) {
                        context.loadAnnotations(url, imageId, context, annotation_type)
                    } else {
                        context.resumeLoadAnnotationsCache[annotation_type] = {
                            url: url
                        }
                    }
                } else {
                    context.statistics[annotation_type.id].loaded = true;
                    context.viewer.raiseEvent('sync_UpdateStatistics', {});
                }
            }
        });
    }

    loadAnnotationsWithConditions(url, imageId, context) {

        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data, textStatus, jqXHR) {

                if (jqXHR.status === 200) {

                    for (let anno of data.results) {
                        if (anno.user.username === context.username ||
                            anno.last_editor.username === context.username)
                            continue;

                        anno.annotation_type = context.annotationTypes[anno.annotation_type]

                        className = "info";
                        if (anno.description.includes('@') && anno.description.includes(context.username)) {
                            className = "warn";
                        }

                        // annotation to update
                        if (anno.unique_identifier in context.annotations) {
                            context.viewer.raiseEvent('sync_AnnotationUpdated', { anno });
                            if (anno.deleted) {
                                context.synchronisationNotifications(className, anno, "AnnotationDeleted")
                            }
                            else {
                                context.synchronisationNotifications(className, anno, "AnnotationUpdated")
                            }
                        } else {
                            let annotations = [anno];
                            context.viewer.raiseEvent('sync_drawAnnotations', { annotations });
                            context.synchronisationNotifications(className, anno, "AnnotationCreated")
                        }

                        // set annotation to values form Server
                        context.annotations[anno.unique_identifier] = anno;
                    }

                    if (data.count > 0) {
                        context.viewer.raiseEvent('sync_UpdateStatistics', {});
                    }

                    if (data.next !== null && context.interruptLoading === false) {
                        context.loadAnnotationsWithConditions(context.API_1_ANNOTATIONS_BASE_URL + data.next.split(context.API_1_ANNOTATIONS_BASE_URL)[1], imageId, context)
                    }
                }
            },
            error: function (request, status, error) {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    loadStatistics(imageId, context) {
        let data = {
            image_id: imageId
        };

        $.ajax(API_IMAGES_BASE_URL + 'image/statistics/', {
            type: 'GET', headers: context.gHeaders, dataType: 'json', data: data,
            success: function (data) {
                for (anno_type of data.statistics) {
                    if (anno_type.id in gAnnotationTypes) {
                        context.statistics[anno_type].total = anno_type.in_image_count;
                        context.statistics[anno_type].verified = anno_type.verified_count;
                    }
                }
            },
            error: function () {

            }
        });
    }

    synchronisationNotifications(className, anno, mode) {

        switch (mode) {
            case "AnnotationCreated":
                $.notify(`Annotation ${anno.id} was created by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
            case "AnnotationDeleted":
                $.notify(`Annotation ${anno.id} was deleted by ${anno.last_editor.username}`,
                    { position: "bottom center", className: "info" });
                break;
            case "AnnotationUpdated":
                $.notify(`Annotation ${anno.id} was updated by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
        }
    }

    destroy() {
        this.interruptLoading = true;
        clearInterval(this.clearInterval);
    }
}

class EXACTGloabalAnnotationSync extends EXACTAnnotationSync {

    initLoadAnnotations(annotationTypes, imageId, limit = 250) {

        let filter = 'image=' + imageId + '&' + "deleted=False&";

        for (annotation_type of Object.values(annotationTypes)) {

            this.statistics[annotation_type.id] = {
                total: 0,
                loaded: false,
                verified: 0
            }

            filter += 'annotation_type=' + annotation_type.id + '&';
        }

        let url = `${this.API_1_ANNOTATIONS_BASE_URL}annotations/?limit=${limit}&${filter}${this.API_1_ANNOTATION_EXPAND}${this.API_1_ANNOTATION_FIELDS}`
        this.loadAnnotations(url, imageId, this)
    }

    loadAnnotations(url, imageId, context, annotation_type = undefined) {
        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data) {

                for (let anno of data.results) {
                    // set annoation type
                    anno.annotation_type = context.annotationTypes[anno.annotation_type];

                    //  New global Annotations Added                
                    context.annotations[anno.annotation_type.id] = anno;
                    context.statistics[annotation_type.id].loaded = true;
                }

                if (data.results.length > 0) {
                    context.viewer.raiseEvent('sync_GlobalAnnotations', { anno });
                }
            }
        });
    }


    loadAnnotationsWithConditions(url, imageId, context) {

        $.ajax(url, {
            type: 'GET', headers: context.gHeaders, dataType: 'json',
            success: function (data, textStatus, jqXHR) {

                for (let anno of data.results) {
                    if (anno.user.username === context.username ||
                        anno.last_editor.username === context.username)
                        continue;

                    anno.annotation_type = context.annotationTypes[anno.annotation_type]

                    className = "info";
                    if (anno.description.includes('@') && anno.description.includes(context.username)) {
                        className = "warn";
                    }

                    // annotation to update
                    if (anno.annotation_type.id in context.annotations) {
                        if (anno.deleted) {
                            context.synchronisationNotifications(className, anno, "GlobalAnnotationDeleted")
                        }
                        else {
                            context.synchronisationNotifications(className, anno, "GlobalAnnotationUpdated")
                        }
                    } else {
                        context.synchronisationNotifications(className, anno, "GlobalAnnotationCreated")
                    }

                    // set annotation to values form Server
                    context.annotations[anno.annotation_type.id] = anno;
                    context.viewer.raiseEvent('sync_GloablAnnotationUpdated', { anno });
                }

                if (data.count > 0) {
                    context.viewer.raiseEvent('sync_UpdateStatistics', { new_annos });
                }

            },
            error: function (request, status, error) {
                $.notify(`Server ERR_CONNECTION_REFUSED`, { position: "bottom center", className: "error" });
            }
        });
    }

    synchronisationNotifications(className, anno, mode) {

        switch (mode) {
            case "GlobalAnnotationCreated":
                $.notify(`Global annotation ${anno.id} was created by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
            case "GlobalAnnotationDeleted":
                $.notify(`Global annotation ${anno.id} was deleted by ${anno.last_editor.username}`,
                    { position: "bottom center", className: "info" });
                break;
            case "GlobalAnnotationUpdated":
                $.notify(`Global annotation ${anno.id} was updated by ${anno.last_editor.username}`,
                    { position: "bottom center", className: className });
                break;
        }
    }
}